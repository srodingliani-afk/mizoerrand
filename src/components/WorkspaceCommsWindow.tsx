import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Copy,
  ExternalLink,
  GraduationCap,
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  Table2,
  Video,
} from 'lucide-react';
import type { ErrandRequest, Language, MarketplaceOrder, MizoramDistrict } from '../shared/types';
import { LayerWindow } from './LayerWindow';
import { GoogleSignInButton } from './GoogleSignInButton';
import { getGoogleWorkspaceAccessToken, useFirebaseAuth } from '../lib/firebase';
import { triggerHaptic } from '../lib/nativeBridge';
import {
  createGoogleMeetSpace,
  fetchChatMessages,
  fetchChatSpaces,
  fetchGmailMessages,
  formatZoRunOrderCommsTemplate,
  sendChatMessage,
  sendGmailEmail,
  type ChatMessageItem,
  type ChatSpaceSummary,
  type GmailMessageSummary,
  type MeetSpaceResult,
  type ParsedChatError,
} from '../lib/workspaceComms';
import {
  appendSheetRows,
  createClassroomAnnouncement,
  createClassroomCourseWork,
  createSpreadsheetWithRows,
  extractDriveSpreadsheetId,
  fetchClassroomCourseDetails,
  fetchClassroomCourses,
  fetchSpreadsheetMetadata,
  fetchUserSpreadsheets,
  formatZoRunCampusAnnouncement,
  formatZoRunOrdersSheetRows,
  readSheetRange,
  type ClassroomAnnouncementItem,
  type ClassroomCourseSummary,
  type ClassroomCourseWorkItem,
  type ClassroomMaterialItem,
  type ParsedClassroomError,
  type SpreadsheetMetadata,
  type SpreadsheetSummary,
} from '../lib/workspaceSheetsClassroom';

export type WorkspaceTab = 'gmail' | 'chat' | 'meet' | 'sheets' | 'classroom';

interface PendingConfirmation {
  kind:
    | 'send_gmail'
    | 'send_chat'
    | 'create_meet'
    | 'create_sheet'
    | 'append_sheet'
    | 'post_classroom_announcement'
    | 'create_classroom_work';
  title: string;
  description: string;
  details: Array<{ label: string; value: string }>;
  onConfirm: () => Promise<void>;
}

interface WorkspaceCommsWindowProps {
  open: boolean;
  onClose: () => void;
  lang: Language;
  selectedDistrict: MizoramDistrict;
  initialTab?: WorkspaceTab;
  latestErrand?: ErrandRequest | null;
  latestOrder?: MarketplaceOrder | null;
  allErrands?: ErrandRequest[];
  allOrders?: MarketplaceOrder[];
}

const CHAT_CONSOLE_URL =
  'https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat?project=gen-lang-client-0086839991';

export const WorkspaceCommsWindow: React.FC<WorkspaceCommsWindowProps> = ({
  open,
  onClose,
  lang,
  selectedDistrict,
  initialTab = 'gmail',
  latestErrand = null,
  latestOrder = null,
  allErrands = [],
  allOrders = [],
}) => {
  const { user, workspaceConnected, loading: authLoading, authError, signInWithGoogle } =
    useFirebaseAuth();

  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab);
  const [statusNotice, setStatusNotice] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmation | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Gmail State
  const [gmailQuery, setGmailQuery] = useState('');
  const [gmailMessages, setGmailMessages] = useState<GmailMessageSummary[]>([]);
  const [loadingGmail, setLoadingGmail] = useState(false);
  const [gmailTo, setGmailTo] = useState('');
  const [gmailSubject, setGmailSubject] = useState('');
  const [gmailBody, setGmailBody] = useState('');

  // Google Chat State
  const [chatSpaces, setChatSpaces] = useState<ChatSpaceSummary[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<ChatSpaceSummary | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const [chatErrorInfo, setChatErrorInfo] = useState<ParsedChatError | null>(null);

  // Google Meet State
  const [meetAccessType, setMeetAccessType] = useState<'TRUSTED' | 'OPEN'>('TRUSTED');
  const [createdMeet, setCreatedMeet] = useState<MeetSpaceResult | null>(null);
  const [copiedMeetUrl, setCopiedMeetUrl] = useState(false);

  // Google Sheets State
  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetSummary[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [sheetLookupInput, setSheetLookupInput] = useState('');
  const [selectedSheetMeta, setSelectedSheetMeta] = useState<SpreadsheetMetadata | null>(null);
  const [selectedTabTitle, setSelectedTabTitle] = useState('');
  const [sheetRows, setSheetRows] = useState<string[][]>([]);
  const [newSheetTitle, setNewSheetTitle] = useState('');
  const [sheetAppendNote, setSheetAppendNote] = useState('');

  // Google Classroom State
  const [courses, setCourses] = useState<ClassroomCourseSummary[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<ClassroomCourseSummary | null>(null);
  const [announcements, setAnnouncements] = useState<ClassroomAnnouncementItem[]>([]);
  const [courseWork, setCourseWork] = useState<ClassroomCourseWorkItem[]>([]);
  const [materials, setMaterials] = useState<ClassroomMaterialItem[]>([]);
  const [loadingClassroom, setLoadingClassroom] = useState(false);
  const [classroomErrorInfo, setClassroomErrorInfo] = useState<ParsedClassroomError | null>(null);
  const [classroomMode, setClassroomMode] = useState<'announcement' | 'assignment'>('announcement');
  const [announcementDraft, setAnnouncementDraft] = useState('');
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentDescription, setAssignmentDescription] = useState('');
  const [assignmentPoints, setAssignmentPoints] = useState('100');

  const accessToken = workspaceConnected ? getGoogleWorkspaceAccessToken() : null;

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setStatusNotice(null);
      setPendingConfirm(null);
      if (!newSheetTitle) {
        setNewSheetTitle(`ZoRun ${selectedDistrict} Order Ledger`);
      }
    }
  }, [open, initialTab, selectedDistrict, newSheetTitle]);

  const orderTemplate = useMemo(
    () =>
      formatZoRunOrderCommsTemplate({
        district: selectedDistrict,
        lang,
        latestErrand,
        latestOrder,
      }),
    [selectedDistrict, lang, latestErrand, latestOrder]
  );

  const loadGmail = useCallback(async () => {
    const token = getGoogleWorkspaceAccessToken();
    if (!token) return;
    setLoadingGmail(true);
    setStatusNotice(null);
    try {
      const items = await fetchGmailMessages(token, gmailQuery, 8);
      setGmailMessages(items);
    } catch (err) {
      setStatusNotice({
        type: 'err',
        msg: err instanceof Error ? err.message : 'Could not load Gmail messages.',
      });
    } finally {
      setLoadingGmail(false);
    }
  }, [gmailQuery]);

  const loadChatMessages = useCallback(async (space: ChatSpaceSummary) => {
    const token = getGoogleWorkspaceAccessToken();
    if (!token) return;
    setLoadingChat(true);
    const res = await fetchChatMessages(token, space.name);
    if (res.errorInfo) {
      setChatErrorInfo(res.errorInfo);
    } else {
      setChatErrorInfo(null);
      setChatMessages(res.messages);
    }
    setLoadingChat(false);
  }, []);

  const loadChatSpaces = useCallback(async () => {
    const token = getGoogleWorkspaceAccessToken();
    if (!token) return;
    setLoadingChat(true);
    setChatErrorInfo(null);
    const res = await fetchChatSpaces(token);
    if (res.errorInfo) {
      setChatErrorInfo(res.errorInfo);
      setChatSpaces([]);
      setLoadingChat(false);
      return;
    }
    setChatSpaces(res.spaces);
    if (res.spaces.length > 0) {
      const target = res.spaces[0];
      setSelectedSpace(target);
      await loadChatMessages(target);
    } else {
      setLoadingChat(false);
    }
  }, [loadChatMessages]);

  const openSpreadsheetById = useCallback(
    async (spreadsheetId: string, preferredTab?: string) => {
      const token = getGoogleWorkspaceAccessToken();
      if (!token) return;
      setLoadingSheets(true);
      setStatusNotice(null);
      try {
        const meta = await fetchSpreadsheetMetadata(token, spreadsheetId);
        setSelectedSheetMeta(meta);
        const tabToRead =
          meta.sheets.find((s) => s.title === preferredTab)?.title ||
          meta.sheets[0]?.title ||
          '';
        setSelectedTabTitle(tabToRead);
        if (tabToRead) {
          const values = await readSheetRange(token, meta.spreadsheetId, tabToRead, 'A1:I25');
          setSheetRows(values);
        } else {
          setSheetRows([]);
        }
      } catch (err) {
        setStatusNotice({
          type: 'err',
          msg: err instanceof Error ? err.message : 'Failed to inspect Google Sheet.',
        });
      } finally {
        setLoadingSheets(false);
      }
    },
    []
  );

  const loadSheetsList = useCallback(async () => {
    const token = getGoogleWorkspaceAccessToken();
    if (!token) return;
    setLoadingSheets(true);
    setStatusNotice(null);
    try {
      const list = await fetchUserSpreadsheets(token, 12);
      setSpreadsheets(list);
      if (list.length > 0 && !selectedSheetMeta) {
        await openSpreadsheetById(list[0].id);
      }
    } catch (err) {
      setStatusNotice({
        type: 'err',
        msg: err instanceof Error ? err.message : 'Could not load Google Sheets.',
      });
    } finally {
      setLoadingSheets(false);
    }
  }, [openSpreadsheetById, selectedSheetMeta]);

  const loadCourseDetails = useCallback(async (course: ClassroomCourseSummary) => {
    const token = getGoogleWorkspaceAccessToken();
    if (!token) return;
    setLoadingClassroom(true);
    const details = await fetchClassroomCourseDetails(token, course.id);
    if (details.errorInfo) {
      setClassroomErrorInfo(details.errorInfo);
    } else {
      setClassroomErrorInfo(null);
      setAnnouncements(details.announcements);
      setCourseWork(details.courseWork);
      setMaterials(details.materials);
    }
    setLoadingClassroom(false);
  }, []);

  const loadClassroomCourses = useCallback(async () => {
    const token = getGoogleWorkspaceAccessToken();
    if (!token) return;
    setLoadingClassroom(true);
    setClassroomErrorInfo(null);
    const res = await fetchClassroomCourses(token);
    if (res.errorInfo) {
      setClassroomErrorInfo(res.errorInfo);
      setCourses([]);
      setLoadingClassroom(false);
      return;
    }
    setCourses(res.courses);
    if (res.courses.length > 0) {
      const target = res.courses[0];
      setSelectedCourse(target);
      await loadCourseDetails(target);
    } else {
      setLoadingClassroom(false);
    }
  }, [loadCourseDetails]);

  useEffect(() => {
    if (!open || !accessToken) return;
    if (activeTab === 'gmail' && gmailMessages.length === 0) {
      void loadGmail();
    } else if (activeTab === 'chat' && chatSpaces.length === 0 && !chatErrorInfo) {
      void loadChatSpaces();
    } else if (activeTab === 'sheets' && spreadsheets.length === 0) {
      void loadSheetsList();
    } else if (activeTab === 'classroom' && courses.length === 0 && !classroomErrorInfo) {
      void loadClassroomCourses();
    }
  }, [
    open,
    accessToken,
    activeTab,
    gmailMessages.length,
    chatSpaces.length,
    chatErrorInfo,
    spreadsheets.length,
    courses.length,
    classroomErrorInfo,
    loadGmail,
    loadChatSpaces,
    loadSheetsList,
    loadClassroomCourses,
  ]);

  const handleRequestSendGmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gmailTo.trim() || !gmailTo.includes('@')) {
      setStatusNotice({
        type: 'err',
        msg: lang === 'miz' ? 'Email address dik tak ziak rawh.' : 'Please enter a valid recipient email.',
      });
      return;
    }
    if (!gmailSubject.trim()) {
      setStatusNotice({
        type: 'err',
        msg: lang === 'miz' ? 'Email thupui (Subject) ziak rawh.' : 'Please enter an email subject.',
      });
      return;
    }

    setPendingConfirm({
      kind: 'send_gmail',
      title: lang === 'miz' ? 'Gmail Thawn Nemnghehna' : 'Confirm Sending Gmail',
      description:
        lang === 'miz'
          ? 'I Google Account hmangin he email hi thawn tak tak i duh em?'
          : 'This will send a real email from your signed-in Gmail account.',
      details: [
        { label: 'To', value: gmailTo.trim() },
        { label: 'Subject', value: gmailSubject.trim() },
        { label: 'Preview', value: gmailBody.trim().slice(0, 140) || '(Empty body)' },
      ],
      onConfirm: async () => {
        const token = getGoogleWorkspaceAccessToken();
        if (!token) throw new Error('Google Workspace session unavailable. Please sign in again.');
        await sendGmailEmail(token, {
          to: gmailTo.trim(),
          subject: gmailSubject.trim(),
          body: gmailBody.trim(),
        });
        triggerHaptic('success');
        setStatusNotice({
          type: 'ok',
          msg:
            lang === 'miz'
              ? `${gmailTo.trim()} hnenah Gmail thawn fel a ni!`
              : `Email sent via Gmail to ${gmailTo.trim()}.`,
        });
        setGmailBody('');
        void loadGmail();
      },
    });
  };

  const handleRequestSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSpace || !chatDraft.trim()) return;

    const draftText = chatDraft.trim();
    const spaceTarget = selectedSpace;
    setPendingConfirm({
      kind: 'send_chat',
      title: lang === 'miz' ? 'Google Chat Thawn Nemnghehna' : 'Confirm Google Chat Message',
      description:
        lang === 'miz'
          ? 'He thuchah hi Google Chat space-ah post i duh tak tak em?'
          : 'This will post a message into the selected Google Chat space.',
      details: [
        { label: 'Space', value: spaceTarget.displayName },
        { label: 'Message', value: draftText },
      ],
      onConfirm: async () => {
        const token = getGoogleWorkspaceAccessToken();
        if (!token) throw new Error('Google Workspace session unavailable. Please sign in again.');
        const res = await sendChatMessage(token, spaceTarget.name, draftText);
        if (!res.ok) {
          if (res.errorInfo) setChatErrorInfo(res.errorInfo);
          throw new Error(res.errorInfo?.message || 'Failed to send Google Chat message.');
        }
        triggerHaptic('success');
        setChatDraft('');
        setStatusNotice({
          type: 'ok',
          msg: `Message posted to ${spaceTarget.displayName}.`,
        });
        await loadChatMessages(spaceTarget);
      },
    });
  };

  const handleRequestCreateMeet = () => {
    setPendingConfirm({
      kind: 'create_meet',
      title: lang === 'miz' ? 'Google Meet Room Siam Nemnghehna' : 'Confirm Creating Google Meet Room',
      description:
        lang === 'miz'
          ? 'Awmpui interview emaw En Hmasak video inspection atana Meet link thar siam i duh em?'
          : 'This will create a new live Google Meet conference link on your Google account.',
      details: [
        {
          label: 'Purpose',
          value: `ZoRûn ${selectedDistrict} Support / Verification Call`,
        },
        {
          label: 'Access Mode',
          value:
            meetAccessType === 'OPEN'
              ? 'Open (Anyone with link can join)'
              : 'Trusted (Workspace / Invited participants)',
        },
      ],
      onConfirm: async () => {
        const token = getGoogleWorkspaceAccessToken();
        if (!token) throw new Error('Google Workspace session unavailable. Please sign in again.');
        const meet = await createGoogleMeetSpace(token, meetAccessType);
        setCreatedMeet(meet);
        triggerHaptic('success');
        setStatusNotice({
          type: 'ok',
          msg:
            lang === 'miz'
              ? `Google Meet room siam fel a ni! Code: ${meet.meetingCode}`
              : `Google Meet room created! Code: ${meet.meetingCode}`,
        });
      },
    });
  };

  const handleRequestCreateLedgerSheet = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newSheetTitle.trim() || `ZoRun ${selectedDistrict} Order Ledger`;
    const rowsToExport = formatZoRunOrdersSheetRows({
      district: selectedDistrict,
      errands: allErrands.length > 0 ? allErrands : latestErrand ? [latestErrand] : [],
      orders: allOrders.length > 0 ? allOrders : latestOrder ? [latestOrder] : [],
    });

    setPendingConfirm({
      kind: 'create_sheet',
      title: lang === 'miz' ? 'Google Sheet Siam Nemnghehna' : 'Confirm Creating Google Sheet',
      description:
        lang === 'miz'
          ? 'I Google Drive-ah ZoRûn order ledger spreadsheet thar siam i duh tak tak em?'
          : 'This will create a new Google Spreadsheet in your Google Drive and export ZoRûn dispatch rows.',
      details: [
        { label: 'Title', value: title },
        { label: 'Tab Name', value: `${selectedDistrict} Ledger` },
        { label: 'Rows', value: `${rowsToExport.length} rows (including header)` },
      ],
      onConfirm: async () => {
        const token = getGoogleWorkspaceAccessToken();
        if (!token) throw new Error('Google Workspace session unavailable. Please sign in again.');
        const tabName = `${selectedDistrict} Ledger`;
        const meta = await createSpreadsheetWithRows(token, title, tabName, rowsToExport);
        setSelectedSheetMeta(meta);
        setSelectedTabTitle(meta.sheets[0]?.title || tabName);
        setSheetRows(rowsToExport);
        triggerHaptic('success');
        setStatusNotice({
          type: 'ok',
          msg: `Created Google Sheet "${meta.title}" with ${rowsToExport.length} rows.`,
        });
        void loadSheetsList();
      },
    });
  };

  const handleRequestAppendSheetRow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSheetMeta || !selectedTabTitle) return;
    const note = sheetAppendNote.trim() || orderTemplate.chatNote;
    const row = [
      'Manual Dispatch',
      latestErrand?.id || `NOTE-${Date.now().toString().slice(-4)}`,
      selectedDistrict,
      note,
      latestErrand ? `${latestErrand.origin.label} -> ${latestErrand.destination.label}` : selectedDistrict,
      latestErrand?.status.toUpperCase() || 'LOGGED',
      String(latestErrand?.allInclusiveTotal ?? 0),
      String(latestErrand?.kailawnSurchargeRs ?? 0),
      new Date().toISOString(),
    ];

    setPendingConfirm({
      kind: 'append_sheet',
      title: lang === 'miz' ? 'Google Sheet Update Nemnghehna' : 'Confirm Appending Spreadsheet Row',
      description:
        lang === 'miz'
          ? 'He Google Sheet tab-ah hian row thar belh tak tak i duh em?'
          : 'This will append 1 new row into the selected Google Sheet tab.',
      details: [
        { label: 'Spreadsheet', value: selectedSheetMeta.title },
        { label: 'Tab', value: selectedTabTitle },
        { label: 'Row Data', value: `${row[1]} · ${note.slice(0, 100)}` },
      ],
      onConfirm: async () => {
        const token = getGoogleWorkspaceAccessToken();
        if (!token) throw new Error('Google Workspace session unavailable. Please sign in again.');
        await appendSheetRows(token, selectedSheetMeta.spreadsheetId, selectedTabTitle, [row]);
        setSheetAppendNote('');
        const updated = await readSheetRange(
          token,
          selectedSheetMeta.spreadsheetId,
          selectedTabTitle,
          'A1:I25'
        );
        setSheetRows(updated);
        triggerHaptic('success');
        setStatusNotice({
          type: 'ok',
          msg: `Appended row to "${selectedSheetMeta.title}" (${selectedTabTitle}).`,
        });
      },
    });
  };

  const handleRequestClassroomPost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse) return;

    if (classroomMode === 'announcement') {
      const text = announcementDraft.trim();
      if (!text) return;
      setPendingConfirm({
        kind: 'post_classroom_announcement',
        title: lang === 'miz' ? 'Classroom Hriattirna Post Nemnghehna' : 'Confirm Classroom Announcement',
        description:
          lang === 'miz'
            ? 'He thuchah hi Google Classroom course stream-ah post i duh tak tak em?'
            : 'This will publish a live announcement into the selected Google Classroom course stream.',
        details: [
          { label: 'Course', value: selectedCourse.name },
          { label: 'Message', value: text.slice(0, 160) },
        ],
        onConfirm: async () => {
          const token = getGoogleWorkspaceAccessToken();
          if (!token) throw new Error('Google Workspace session unavailable. Please sign in again.');
          await createClassroomAnnouncement(token, selectedCourse.id, text);
          setAnnouncementDraft('');
          triggerHaptic('success');
          setStatusNotice({
            type: 'ok',
            msg: `Published announcement to ${selectedCourse.name}.`,
          });
          await loadCourseDetails(selectedCourse);
        },
      });
      return;
    }

    const title = assignmentTitle.trim();
    if (!title) return;
    const pts = Number(assignmentPoints);
    const maxPoints = Number.isFinite(pts) && pts >= 0 ? pts : undefined;
    setPendingConfirm({
      kind: 'create_classroom_work',
      title: lang === 'miz' ? 'Classroom Assignment Siam Nemnghehna' : 'Confirm Creating Assignment',
      description:
        lang === 'miz'
          ? 'Google Classroom-ah assignment thar siam tak tak i duh em?'
          : 'This will publish a new CourseWork assignment in the selected Google Classroom course.',
      details: [
        { label: 'Course', value: selectedCourse.name },
        { label: 'Title', value: title },
        { label: 'Max Points', value: maxPoints !== undefined ? String(maxPoints) : 'Ungraded' },
      ],
      onConfirm: async () => {
        const token = getGoogleWorkspaceAccessToken();
        if (!token) throw new Error('Google Workspace session unavailable. Please sign in again.');
        await createClassroomCourseWork(token, selectedCourse.id, {
          title,
          description: assignmentDescription,
          maxPoints,
        });
        setAssignmentTitle('');
        setAssignmentDescription('');
        triggerHaptic('success');
        setStatusNotice({
          type: 'ok',
          msg: `Created CourseWork "${title}" in ${selectedCourse.name}.`,
        });
        await loadCourseDetails(selectedCourse);
      },
    });
  };

  const executeConfirmedAction = async () => {
    if (!pendingConfirm) return;
    setConfirmBusy(true);
    setStatusNotice(null);
    try {
      await pendingConfirm.onConfirm();
      setPendingConfirm(null);
    } catch (err) {
      triggerHaptic('error');
      setStatusNotice({
        type: 'err',
        msg: err instanceof Error ? err.message : 'Workspace operation failed.',
      });
      setPendingConfirm(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  const fillOrderReceiptIntoEmail = () => {
    triggerHaptic('light');
    if (!gmailTo && user?.email) {
      setGmailTo(user.email);
    }
    setGmailSubject(orderTemplate.subject);
    setGmailBody(orderTemplate.body);
  };

  const shareMeetViaGmail = () => {
    if (!createdMeet) return;
    setGmailSubject(`ZoRûn Google Meet Call · ${selectedDistrict}`);
    setGmailBody(
      `Join our ZoRûn (${selectedDistrict}) live video check / interview on Google Meet:\n\nLink: ${createdMeet.meetingUri}\nCode: ${createdMeet.meetingCode}\nAccess: ${createdMeet.accessType}`
    );
    setActiveTab('gmail');
  };

  const copyMeetUri = async () => {
    if (!createdMeet?.meetingUri) return;
    try {
      await navigator.clipboard.writeText(createdMeet.meetingUri);
      setCopiedMeetUrl(true);
      setTimeout(() => setCopiedMeetUrl(false), 2000);
    } catch {
      // ignore clipboard restrictions
    }
  };

  return (
    <LayerWindow
      open={open}
      onClose={onClose}
      title={lang === 'miz' ? 'Google Workspace Hub' : 'Google Workspace Hub'}
      subtitle={
        lang === 'miz'
          ? 'Gmail, Chat, Meet, Sheets & Classroom'
          : 'Gmail, Chat, Meet, Sheets & Classroom'
      }
      size="lg"
    >
      <div className="space-y-4">
        {/* Service Tabs */}
        <div
          role="tablist"
          aria-label="Google Workspace channels"
          className="flex overflow-x-auto sm:grid sm:grid-cols-5 gap-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800 p-1"
        >
          {(
            [
              ['gmail', 'Gmail', <Mail key="m" className="w-4 h-4" />],
              ['chat', 'Chat', <MessageSquare key="c" className="w-4 h-4" />],
              ['meet', 'Meet', <Video key="v" className="w-4 h-4" />],
              ['sheets', 'Sheets', <Table2 key="s" className="w-4 h-4" />],
              ['classroom', 'Classroom', <GraduationCap key="cl" className="w-4 h-4" />],
            ] as const
          ).map(([tabId, label, icon]) => (
            <button
              key={tabId}
              type="button"
              role="tab"
              aria-selected={activeTab === tabId}
              onClick={() => {
                triggerHaptic('light');
                setActiveTab(tabId);
              }}
              className={`min-h-[42px] shrink-0 flex-1 rounded-xl px-3 sm:px-2.5 py-2 text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors duration-75 ${
                activeTab === tabId
                  ? 'bg-white dark:bg-slate-900 text-emerald-900 dark:text-emerald-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Auth Error */}
        {authError && (
          <div
            role="alert"
            className="rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-4 py-3 text-xs text-red-800 dark:text-red-200 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        {/* Operation Feedback Notice */}
        {statusNotice && (
          <div
            role="status"
            className={`rounded-2xl px-4 py-3 text-xs font-semibold flex items-center gap-2 ${
              statusNotice.type === 'ok'
                ? 'bg-emerald-900 text-white'
                : 'bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-900'
            }`}
          >
            {statusNotice.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="break-words">{statusNotice.msg}</span>
          </div>
        )}

        {/* Explicit User Confirmation Dialog (Mandatory before Gmail / Chat / Meet mutations) */}
        {pendingConfirm && (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="workspace-confirm-title"
            className="rounded-2xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 p-4 space-y-3"
          >
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3
                  id="workspace-confirm-title"
                  className="text-sm font-extrabold text-slate-900 dark:text-slate-100"
                >
                  {pendingConfirm.title}
                </h3>
                <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                  {pendingConfirm.description}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-slate-800 p-3 space-y-1.5 text-xs">
              {pendingConfirm.details.map((item) => (
                <div key={item.label} className="flex gap-2">
                  <span className="font-bold text-slate-500 dark:text-slate-400 min-w-[68px]">
                    {item.label}:
                  </span>
                  <span className="text-slate-900 dark:text-slate-100 break-words">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setPendingConfirm(null)}
                className="min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50"
              >
                {lang === 'miz' ? 'Cancel' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => void executeConfirmedAction()}
                className="min-h-[40px] rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-900 disabled:opacity-50"
              >
                {confirmBusy
                  ? lang === 'miz'
                    ? 'Tih mek...'
                    : 'Executing...'
                  : lang === 'miz'
                    ? 'Confirm & Proceed'
                    : 'Confirm & Proceed'}
              </button>
            </div>
          </div>
        )}

        {/* Unauthenticated State: Official Google Sign-In Gate */}
        {!accessToken ? (
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 flex items-center justify-center">
              {activeTab === 'gmail' ? (
                <Mail className="w-6 h-6" />
              ) : activeTab === 'chat' ? (
                <MessageSquare className="w-6 h-6" />
              ) : activeTab === 'meet' ? (
                <Video className="w-6 h-6" />
              ) : activeTab === 'sheets' ? (
                <Table2 className="w-6 h-6" />
              ) : (
                <GraduationCap className="w-6 h-6" />
              )}
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                {lang === 'miz'
                  ? 'Google Account hmangin thlunzawm rawh'
                  : 'Connect Google Workspace for ZoRûn'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {lang === 'miz'
                  ? 'I phalna nen Gmail, Chat, Meet, Google Sheets order ledger export, leh Google Classroom course tools te a hman theih nghal ang.'
                  : 'With your permission, ZoRûn can read & send Gmail order updates, connect Google Chat & Meet, export order ledgers to Google Sheets, and manage Google Classroom notices.'}
              </p>
            </div>
            <div className="flex justify-center">
              <GoogleSignInButton
                disabled={authLoading}
                label={lang === 'miz' ? 'Sign in with Google' : 'Sign in with Google'}
                onClick={() => {
                  triggerHaptic('medium');
                  void signInWithGoogle(selectedDistrict);
                }}
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {lang === 'miz'
                ? 'Access token chu memory chhungah chauh him taka vawn a ni.'
                : 'Access tokens stay strictly in browser memory and clear automatically on sign-out.'}
            </p>
          </div>
        ) : (
          <>
            {/* ============================================================= */}
            {/* TAB 1: GMAIL INBOX & ORDER RECEIPT SENDER                     */}
            {/* ============================================================= */}
            {activeTab === 'gmail' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-6 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {lang === 'miz' ? 'Gmail Inbox Thar' : 'Recent Gmail Messages'}
                    </h3>
                    <button
                      type="button"
                      disabled={loadingGmail}
                      onClick={() => void loadGmail()}
                      className="min-h-[34px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingGmail ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="search"
                      value={gmailQuery}
                      onChange={(e) => setGmailQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void loadGmail();
                        }
                      }}
                      placeholder={lang === 'miz' ? 'Gmail zawnna (e.g. ZoRûn)...' : 'Search Gmail (e.g. ZoRûn)...'}
                      className="flex-1 min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => void loadGmail()}
                      className="min-h-[40px] rounded-xl bg-slate-900 dark:bg-emerald-800 px-3.5 text-xs font-bold text-white"
                    >
                      Search
                    </button>
                  </div>

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                    {loadingGmail ? (
                      <p className="p-4 text-xs text-slate-500">Loading Gmail inbox...</p>
                    ) : gmailMessages.length === 0 ? (
                      <p className="p-4 text-xs text-slate-500">
                        {lang === 'miz'
                          ? 'Email hmuh a awm rih lo.'
                          : 'No messages matched. Try clearing the search filter or refreshing.'}
                      </p>
                    ) : (
                      gmailMessages.map((msg) => (
                        <div key={msg.id} className="p-3 space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                              {msg.subject}
                            </p>
                            {msg.unread && (
                              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                                UNREAD
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {msg.from}
                          </p>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2">
                            {msg.snippet}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <form
                  onSubmit={handleRequestSendGmail}
                  className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                      {lang === 'miz' ? 'Gmail Thawnna' : 'Send Email via Gmail'}
                    </h3>
                    <button
                      type="button"
                      onClick={fillOrderReceiptIntoEmail}
                      className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 hover:underline"
                    >
                      {lang === 'miz' ? '+ Order Receipt Dah' : '+ Fill Order Summary'}
                    </button>
                  </div>

                  <div>
                    <label htmlFor="gmail-to" className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      To
                    </label>
                    <input
                      id="gmail-to"
                      type="email"
                      required
                      value={gmailTo}
                      onChange={(e) => setGmailTo(e.target.value)}
                      placeholder="recipient@example.com"
                      className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label htmlFor="gmail-subject" className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Subject
                    </label>
                    <input
                      id="gmail-subject"
                      type="text"
                      required
                      value={gmailSubject}
                      onChange={(e) => setGmailSubject(e.target.value)}
                      placeholder={`ZoRûn ${selectedDistrict} Order Update`}
                      className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label htmlFor="gmail-body" className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Message
                    </label>
                    <textarea
                      id="gmail-body"
                      rows={4}
                      value={gmailBody}
                      onChange={(e) => setGmailBody(e.target.value)}
                      placeholder={lang === 'miz' ? 'Thuchah ziak rawh...' : 'Write your email message...'}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full min-h-[44px] rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-900 inline-flex items-center justify-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {lang === 'miz' ? 'Review & Send Gmail' : 'Review & Send Gmail'}
                  </button>
                </form>
              </div>
            )}

            {/* ============================================================= */}
            {/* TAB 2: GOOGLE CHAT SPACES & DISPATCH MESSAGING                */}
            {/* ============================================================= */}
            {activeTab === 'chat' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {lang === 'miz' ? 'Google Chat Spaces' : 'Google Chat Dispatch Spaces'}
                  </h3>
                  <button
                    type="button"
                    disabled={loadingChat}
                    onClick={() => void loadChatSpaces()}
                    className="min-h-[34px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingChat ? 'animate-spin' : ''}`} />
                    Reload Spaces
                  </button>
                </div>

                {chatErrorInfo && (
                  <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 space-y-2 text-xs">
                    <p className="font-bold text-amber-950 dark:text-amber-200">
                      Google Chat Prerequisite Notice
                    </p>
                    <p className="text-amber-900 dark:text-amber-300 leading-relaxed">
                      {chatErrorInfo.message}
                    </p>
                    <ul className="list-disc pl-4 text-[11px] text-amber-900/90 dark:text-amber-300/90 space-y-0.5">
                      <li>
                        Requires a <strong>Business or Enterprise Google Workspace account</strong> (consumer <code>@gmail.com</code> accounts cannot call the Chat API).
                      </li>
                      <li>
                        Requires configuring the Google Chat App (Name, Avatar URL &amp; Description) in Google Cloud Console.
                      </li>
                    </ul>
                    <a
                      href={chatErrorInfo.consoleUrl || CHAT_CONSOLE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-bold text-emerald-900 dark:text-emerald-300 underline pt-1"
                    >
                      Configure Google Chat App in Cloud Console
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                    {chatSpaces.length === 0 ? (
                      <p className="p-4 text-xs text-slate-500">
                        {loadingChat ? 'Loading spaces...' : 'No Google Chat spaces available for this account.'}
                      </p>
                    ) : (
                      chatSpaces.map((sp) => (
                        <button
                          key={sp.name}
                          type="button"
                          onClick={() => {
                            setSelectedSpace(sp);
                            void loadChatMessages(sp);
                          }}
                          className={`w-full p-3 text-left transition-colors ${
                            selectedSpace?.name === sp.name
                              ? 'bg-emerald-50 dark:bg-emerald-950/50'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {sp.displayName}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono truncate">{sp.spaceType}</p>
                        </button>
                      ))
                    )}
                  </div>

                  <div className="md:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-3.5 flex flex-col justify-between gap-3 min-h-[240px]">
                    <div className="space-y-2 max-h-44 overflow-y-auto">
                      {selectedSpace ? (
                        chatMessages.length === 0 ? (
                          <p className="text-xs text-slate-500 py-6 text-center">
                            No recent messages in {selectedSpace.displayName}.
                          </p>
                        ) : (
                          chatMessages.map((m) => (
                            <div
                              key={m.name}
                              className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 px-3 py-2 text-xs"
                            >
                              <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400">
                                {m.senderName}
                              </p>
                              <p className="text-slate-800 dark:text-slate-200 mt-0.5 break-words">{m.text}</p>
                            </div>
                          ))
                        )
                      ) : (
                        <p className="text-xs text-slate-500 py-6 text-center">
                          Select a Google Chat space on the left or sign in with a Workspace account.
                        </p>
                      )}
                    </div>

                    <form onSubmit={handleRequestSendChat} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setChatDraft(orderTemplate.chatNote)}
                          className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 hover:underline"
                        >
                          + Insert {selectedDistrict} Order Update
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={chatDraft}
                          onChange={(e) => setChatDraft(e.target.value)}
                          disabled={!selectedSpace}
                          placeholder={
                            selectedSpace
                              ? `Message ${selectedSpace.displayName}...`
                              : 'Select a Chat space first...'
                          }
                          className="flex-1 min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-900 dark:text-slate-100 disabled:opacity-50"
                        />
                        <button
                          type="submit"
                          disabled={!selectedSpace || !chatDraft.trim()}
                          className="min-h-[40px] rounded-xl bg-emerald-800 px-4 text-xs font-bold text-white hover:bg-emerald-900 disabled:opacity-50 inline-flex items-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Send
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================= */}
            {/* TAB 3: GOOGLE MEET LIVE VIDEO VERIFICATION & INTERVIEWS       */}
            {/* ============================================================= */}
            {activeTab === 'meet' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-4 space-y-3">
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                    {lang === 'miz'
                      ? 'Awmpui Interview & En Hmasak Live Video Call'
                      : 'Instant Google Meet Video Verification'}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {lang === 'miz'
                      ? 'Awmpui/Driver biak duh tan emaw Dawr thil en hmasak video call atan Google Meet link him tak siam nghal rawh.'
                      : 'Generate an instant Google Meet link for Awmpui / Family Driver interviews, remote Check-Before-Pay gate inspection, or SOS support triage.'}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setMeetAccessType('TRUSTED')}
                      className={`rounded-xl border p-3 text-left text-xs transition-all ${
                        meetAccessType === 'TRUSTED'
                          ? 'border-emerald-700 bg-white dark:bg-slate-900 shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 opacity-80'
                      }`}
                    >
                      <p className="font-bold text-slate-900 dark:text-slate-100">Trusted Access</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Invited users or Workspace members join directly; others knock.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setMeetAccessType('OPEN')}
                      className={`rounded-xl border p-3 text-left text-xs transition-all ${
                        meetAccessType === 'OPEN'
                          ? 'border-emerald-700 bg-white dark:bg-slate-900 shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 opacity-80'
                      }`}
                    >
                      <p className="font-bold text-slate-900 dark:text-slate-100">Open Link Access</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Anyone with the Meet link can join without knocking.
                      </p>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleRequestCreateMeet}
                    className="w-full min-h-[46px] rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-900 inline-flex items-center justify-center gap-2"
                  >
                    <Video className="w-4 h-4" />
                    {lang === 'miz'
                      ? 'Review & Create Google Meet Room'
                      : 'Review & Create Google Meet Room'}
                  </button>
                </div>

                {createdMeet && (
                  <div className="rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                          Meet Room Ready · {createdMeet.accessType}
                        </p>
                        <p className="text-sm font-extrabold font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                          {createdMeet.meetingUri}
                        </p>
                        <p className="text-xs font-mono text-slate-600 dark:text-slate-400">
                          Code: {createdMeet.meetingCode}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void copyMeetUri()}
                          className="min-h-[38px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100 inline-flex items-center gap-1.5"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          {copiedMeetUrl ? 'Copied!' : 'Copy Link'}
                        </button>
                        <a
                          href={createdMeet.meetingUri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[38px] rounded-xl bg-emerald-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-900 inline-flex items-center gap-1.5"
                        >
                          Join Meet
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-emerald-200/70 dark:border-emerald-900 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={shareMeetViaGmail}
                        className="min-h-[36px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100 inline-flex items-center gap-1.5"
                      >
                        <Mail className="w-3.5 h-3.5 text-emerald-700" />
                        Share Invite via Gmail
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ============================================================= */}
            {/* TAB 4: GOOGLE SHEETS ORDER LEDGER & EXPENSE EXPORTS           */}
            {/* ============================================================= */}
            {activeTab === 'sheets' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Your Google Sheets
                      </h3>
                      <button
                        type="button"
                        disabled={loadingSheets}
                        onClick={() => void loadSheetsList()}
                        className="min-h-[34px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingSheets ? 'animate-spin' : ''}`} />
                        Refresh
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={sheetLookupInput}
                        onChange={(e) => setSheetLookupInput(e.target.value)}
                        placeholder="Paste Google Sheet URL or ID..."
                        className="flex-1 min-h-[38px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-900 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const parsed = extractDriveSpreadsheetId(sheetLookupInput);
                          if (!parsed) {
                            setStatusNotice({
                              type: 'err',
                              msg: 'Enter a valid Google Sheets URL or Spreadsheet ID.',
                            });
                            return;
                          }
                          void openSpreadsheetById(parsed);
                        }}
                        className="min-h-[38px] rounded-xl bg-slate-900 dark:bg-emerald-800 px-3 text-xs font-bold text-white"
                      >
                        Open
                      </button>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
                      {loadingSheets && spreadsheets.length === 0 ? (
                        <p className="p-4 text-xs text-slate-500">Loading spreadsheets...</p>
                      ) : spreadsheets.length === 0 ? (
                        <p className="p-4 text-xs text-slate-500">
                          No spreadsheets found yet. Create a new ZoRûn Order Ledger sheet below.
                        </p>
                      ) : (
                        spreadsheets.map((sp) => (
                          <button
                            key={sp.id}
                            type="button"
                            onClick={() => void openSpreadsheetById(sp.id)}
                            className={`w-full p-3 text-left transition-colors ${
                              selectedSheetMeta?.spreadsheetId === sp.id
                                ? 'bg-emerald-50 dark:bg-emerald-950/50'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                              {sp.name}
                            </p>
                            <p className="text-[11px] font-mono text-slate-500 truncate mt-0.5">
                              {sp.id}
                            </p>
                          </button>
                        ))
                      )}
                    </div>

                    <form
                      onSubmit={handleRequestCreateLedgerSheet}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-3.5 space-y-2.5"
                    >
                      <label
                        htmlFor="new-sheet-title"
                        className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300"
                      >
                        Export {selectedDistrict} Ledger to New Sheet
                      </label>
                      <input
                        id="new-sheet-title"
                        type="text"
                        value={newSheetTitle}
                        onChange={(e) => setNewSheetTitle(e.target.value)}
                        placeholder={`ZoRun ${selectedDistrict} Order Ledger`}
                        className="w-full min-h-[38px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-900 dark:text-slate-100"
                      />
                      <button
                        type="submit"
                        className="w-full min-h-[40px] rounded-xl bg-emerald-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-900 inline-flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Review &amp; Create Order Sheet
                      </button>
                    </form>
                  </div>

                  <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-4 space-y-3">
                    {selectedSheetMeta ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 truncate">
                              {selectedSheetMeta.title}
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              Select a sheet tab dynamically ({selectedSheetMeta.sheets.length} tabs)
                            </p>
                          </div>
                          {selectedSheetMeta.spreadsheetUrl && (
                            <a
                              href={selectedSheetMeta.spreadsheetUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-bold text-emerald-800 dark:text-emerald-400 inline-flex items-center gap-1 hover:underline"
                            >
                              Open in Sheets
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {selectedSheetMeta.sheets.map((tab) => (
                            <button
                              key={tab.sheetId}
                              type="button"
                              onClick={() => void openSpreadsheetById(selectedSheetMeta.spreadsheetId, tab.title)}
                              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold border ${
                                selectedTabTitle === tab.title
                                  ? 'border-emerald-700 bg-emerald-800 text-white'
                                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              {tab.title}
                            </button>
                          ))}
                        </div>

                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto max-h-56">
                          {sheetRows.length === 0 ? (
                            <p className="p-4 text-xs text-slate-500">
                              No cell values in tab &ldquo;{selectedTabTitle}&rdquo; yet.
                            </p>
                          ) : (
                            <table className="w-full text-left border-collapse text-[11px]">
                              <tbody>
                                {sheetRows.slice(0, 12).map((r, rIdx) => (
                                  <tr
                                    key={rIdx}
                                    className={
                                      rIdx === 0
                                        ? 'bg-slate-100 dark:bg-slate-800 font-bold text-slate-900 dark:text-slate-100'
                                        : 'border-t border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                                    }
                                  >
                                    {r.slice(0, 7).map((cell, cIdx) => (
                                      <td key={cIdx} className="px-2.5 py-1.5 whitespace-nowrap">
                                        {cell}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>

                        <form onSubmit={handleRequestAppendSheetRow} className="flex flex-wrap gap-2">
                          <input
                            type="text"
                            value={sheetAppendNote}
                            onChange={(e) => setSheetAppendNote(e.target.value)}
                            placeholder={`Append dispatch note to "${selectedTabTitle}"...`}
                            className="flex-1 min-w-[180px] min-h-[38px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-900 dark:text-slate-100"
                          />
                          <button
                            type="submit"
                            className="min-h-[38px] rounded-xl bg-slate-900 dark:bg-emerald-800 px-3.5 text-xs font-bold text-white inline-flex items-center gap-1.5"
                          >
                            <Send className="w-3.5 h-3.5" />
                            Review &amp; Append Row
                          </button>
                        </form>
                      </>
                    ) : (
                      <div className="py-12 text-center text-xs text-slate-500">
                        Select a spreadsheet on the left or create a new {selectedDistrict} Order Ledger sheet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================= */}
            {/* TAB 5: GOOGLE CLASSROOM CAMPUS COURSES, ANNOUNCEMENTS & WORK   */}
            {/* ============================================================= */}
            {activeTab === 'classroom' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Google Classroom Campus &amp; Hostel Integration
                  </h3>
                  <button
                    type="button"
                    disabled={loadingClassroom}
                    onClick={() => void loadClassroomCourses()}
                    className="min-h-[34px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingClassroom ? 'animate-spin' : ''}`} />
                    Reload Courses
                  </button>
                </div>

                {classroomErrorInfo && (
                  <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                    <p className="font-bold">Google Classroom Access Notice</p>
                    <p>{classroomErrorInfo.message}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                    {courses.length === 0 ? (
                      <p className="p-4 text-xs text-slate-500">
                        {loadingClassroom
                          ? 'Loading Google Classroom courses...'
                          : 'No active Google Classroom courses found for this account.'}
                      </p>
                    ) : (
                      courses.map((course) => (
                        <button
                          key={course.id}
                          type="button"
                          onClick={() => {
                            setSelectedCourse(course);
                            void loadCourseDetails(course);
                          }}
                          className={`w-full p-3 text-left transition-colors ${
                            selectedCourse?.id === course.id
                              ? 'bg-emerald-50 dark:bg-emerald-950/50'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {course.name}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            {[course.section, course.room].filter(Boolean).join(' · ') || course.courseState}
                          </p>
                        </button>
                      ))
                    )}
                  </div>

                  <div className="lg:col-span-8 space-y-3">
                    {selectedCourse ? (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2 max-h-44 overflow-y-auto">
                            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                              Announcements ({announcements.length})
                            </p>
                            {announcements.length === 0 ? (
                              <p className="text-[11px] text-slate-400">No announcements.</p>
                            ) : (
                              announcements.map((a) => (
                                <p key={a.id} className="text-xs text-slate-700 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800 pt-1.5 line-clamp-3">
                                  {a.text}
                                </p>
                              ))
                            )}
                          </div>

                          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2 max-h-44 overflow-y-auto">
                            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                              CourseWork ({courseWork.length})
                            </p>
                            {courseWork.length === 0 ? (
                              <p className="text-[11px] text-slate-400">No assignments yet.</p>
                            ) : (
                              courseWork.map((cw) => (
                                <div key={cw.id} className="border-t border-slate-100 dark:border-slate-800 pt-1.5">
                                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                    {cw.title}
                                  </p>
                                  <p className="text-[10px] font-mono text-slate-500">
                                    {cw.workType}{cw.maxPoints ? ` · ${cw.maxPoints} pts` : ''}
                                  </p>
                                </div>
                              ))
                            )}
                          </div>

                          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2 max-h-44 overflow-y-auto">
                            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                              <BookOpen className="w-3 h-3" />
                              Materials ({materials.length})
                            </p>
                            {materials.length === 0 ? (
                              <p className="text-[11px] text-slate-400">No materials posted.</p>
                            ) : (
                              materials.map((mat) => (
                                <p key={mat.id} className="text-xs font-semibold text-slate-800 dark:text-slate-200 border-t border-slate-100 dark:border-slate-800 pt-1.5 truncate">
                                  {mat.title}
                                </p>
                              ))
                            )}
                          </div>
                        </div>

                        <form
                          onSubmit={handleRequestClassroomPost}
                          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-4 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="inline-flex rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-0.5 text-[11px] font-bold">
                              <button
                                type="button"
                                onClick={() => setClassroomMode('announcement')}
                                className={`rounded-lg px-2.5 py-1 ${
                                  classroomMode === 'announcement'
                                    ? 'bg-emerald-800 text-white'
                                    : 'text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                Stream Announcement
                              </button>
                              <button
                                type="button"
                                onClick={() => setClassroomMode('assignment')}
                                className={`rounded-lg px-2.5 py-1 ${
                                  classroomMode === 'assignment'
                                    ? 'bg-emerald-800 text-white'
                                    : 'text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                New Assignment
                              </button>
                            </div>

                            {classroomMode === 'announcement' && (
                              <button
                                type="button"
                                onClick={() =>
                                  setAnnouncementDraft(
                                    formatZoRunCampusAnnouncement({
                                      district: selectedDistrict,
                                      lang,
                                      courseName: selectedCourse.name,
                                    })
                                  )
                                }
                                className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 hover:underline"
                              >
                                + Insert {selectedDistrict} Campus Dispatch Notice
                              </button>
                            )}
                          </div>

                          {classroomMode === 'announcement' ? (
                            <textarea
                              rows={3}
                              required
                              value={announcementDraft}
                              onChange={(e) => setAnnouncementDraft(e.target.value)}
                              placeholder={`Post announcement to ${selectedCourse.name}...`}
                              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs text-slate-900 dark:text-slate-100"
                            />
                          ) : (
                            <div className="space-y-2">
                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                                <input
                                  type="text"
                                  required
                                  value={assignmentTitle}
                                  onChange={(e) => setAssignmentTitle(e.target.value)}
                                  placeholder="Assignment title..."
                                  className="sm:col-span-3 min-h-[38px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-900 dark:text-slate-100"
                                />
                                <input
                                  type="number"
                                  min={0}
                                  value={assignmentPoints}
                                  onChange={(e) => setAssignmentPoints(e.target.value)}
                                  placeholder="Points"
                                  className="min-h-[38px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-mono text-slate-900 dark:text-slate-100"
                                />
                              </div>
                              <textarea
                                rows={2}
                                value={assignmentDescription}
                                onChange={(e) => setAssignmentDescription(e.target.value)}
                                placeholder="Instructions (optional)..."
                                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-xs text-slate-900 dark:text-slate-100"
                              />
                            </div>
                          )}

                          <button
                            type="submit"
                            className="w-full min-h-[42px] rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-900 inline-flex items-center justify-center gap-2"
                          >
                            <Send className="w-3.5 h-3.5" />
                            {classroomMode === 'announcement'
                              ? 'Review & Post Classroom Announcement'
                              : 'Review & Create Assignment'}
                          </button>
                        </form>
                      </>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-8 text-center text-xs text-slate-500">
                        Select a course on the left to view Announcements, CourseWork assignments, and Materials.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </LayerWindow>
  );
};

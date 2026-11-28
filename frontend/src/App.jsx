import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { filterWorkItems, getAssignmentLabel } from "./utils/workFilters.js";
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
const INVOICE_APP_URL = import.meta.env.VITE_INVOICE_APP_URL || "http://localhost:5173";
const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});
api.interceptors.request.use((c) => {
  if (!["get", "head", "options"].includes((c.method || "get").toLowerCase())) {
    const t = document.cookie
      .split("; ")
      .find((x) => x.startsWith("csrfToken="))
      ?.split("=")[1];
    if (t) c.headers["x-csrf-token"] = decodeURIComponent(t);
  }
  return c;
});
const today = () => new Date().toLocaleDateString("en-CA");
const indiaDateTimeParts = (value) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
};
const indiaDateTimeToIso = (date, time) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  const clock = /^(\d{2}):(\d{2})$/.exec(time || "");
  if (!match || !clock) return null;
  const [, year, month, day] = match;
  const [, hour, minute] = clock;
  const utc = Date.UTC(+year, +month - 1, +day, +hour, +minute) - 330 * 60 * 1000;
  const result = new Date(utc);
  if (result.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) === "Invalid Date") return null;
  return result.toISOString();
};
const applicationServerKey = (base64) => {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = window.atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};
function App() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState(() =>
      new URLSearchParams(window.location.search).get("page") === "alerts"
        ? "alerts"
        : "work",
    ),
    [status, setStatus] = useState("pending"),
    [searchTerm, setSearchTerm] = useState(""),
    [assignmentFilter, setAssignmentFilter] = useState("all"),
    [works, setWorks] = useState([]),
    [users, setUsers] = useState([]),
    [meetings, setMeetings] = useState([]),
    [meetingView, setMeetingView] = useState("upcoming"),
    [notes, setNotes] = useState([]),
    [notesPage, setNotesPage] = useState(1),
    [notesPages, setNotesPages] = useState(1),
    [unreadTotal, setUnreadTotal] = useState(0),
    [error, setError] = useState(""),
    [modal, setModal] = useState(""),
    [form, setForm] = useState({ completedAt: today() }),
    [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const isAdmin = user?.role === "admin";
  const isSuperAdmin = user?.invoiceRole === "superAdmin";
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [w, n] = await Promise.all([
        api.get("/work", { params: { status } }),
        api.get("/notifications", { params: { page: notesPage } }),
      ]);
      setWorks(w.data);
      setNotes(n.data.notifications);
      setNotesPage(n.data.page);
      setNotesPages(n.data.pages);
      setUnreadTotal(n.data.unread);
    } catch (e) {
      setError(e.response?.data?.message || "Could not load your data.");
    }
  }, [user, status, notesPage]);
  useEffect(() => {
    api
      .get("/auth/me")
      .then((r) => setUser(r.data.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!user) return;
    const id = setInterval(load, 45000);
    return () => clearInterval(id);
  }, [user, load]);
  useEffect(() => {
    if (isAdmin)
      api
        .get("/users")
        .then((r) => setUsers(r.data))
        .catch(() => {});
  }, [isAdmin]);
  useEffect(() => {
    if (!isSuperAdmin) {
      setMeetings([]);
      return;
    }
    api
      .get("/meetings", { params: { view: meetingView } })
      .then((response) => setMeetings(response.data))
      .catch((e) => setError(e.response?.data?.message || "Could not load meetings."));
  }, [isSuperAdmin, meetingView]);
  useEffect(() => {
    if (!user || !("serviceWorker" in navigator)) return;
    let active = true;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (active) setPushEnabled(Boolean(subscription));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);
  useEffect(() => {
    const captureInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
  }, []);
  const workerCompleted = (item) =>
    item.completionRecords?.some(
      (record) => String(record.user?._id || record.user) === String(user?._id),
    ) || false;
  const unread = unreadTotal,
    sorted = useMemo(
      () =>
        [...works].sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
        ),
      [works],
    );
  const filteredWorks = useMemo(
    () => filterWorkItems(sorted, searchTerm, assignmentFilter),
    [sorted, searchTerm, assignmentFilter],
  );
  const openServiceReports = () =>
    window.location.assign(new URL("/admin/service-call-reports", INVOICE_APP_URL).toString());
  const signIn = async (event) => {
    event.preventDefault();
    setError("");
    setLoginBusy(true);
    try {
      const { data } = await api.post("/auth/login", {
        name: loginName.trim(),
        password: loginPassword,
      });
      setUser(data.user);
      setLoginPassword("");
    } catch (e) {
      setError(e.response?.data?.message || "Could not sign in. Check your username and password.");
    } finally {
      setLoginBusy(false);
    }
  };
  const logout = async () => {
    await api.post("/auth/logout");
    setUser(null);
  };
  const openMeeting = (item) => {
    if (item) {
      const { date, time } = indiaDateTimeParts(item.scheduledAt);
      setForm({
        ...item,
        meetingDate: date,
        meetingTime: time,
      });
    } else {
      setForm({
        client: "",
        location: "",
        purpose: "",
        meetingDate: indiaDateTimeParts(new Date()).date,
        meetingTime: "09:00",
      });
    }
    setModal("meeting");
  };
  const removeMeeting = async (id) => {
    if (!confirm("Delete this meeting and its future reminders?")) return;
    try {
      await api.delete("/meetings/" + id);
      setMeetings((current) => current.filter((meeting) => meeting._id !== id));
    } catch (e) {
      setError(e.response?.data?.message || "Could not delete the meeting.");
    }
  };
  const refreshMeetings = async () => {
    const response = await api.get("/meetings", { params: { view: meetingView } });
    setMeetings(response.data);
  };

  const openWork = (item) => {
    setForm(
      item
        ? {
            ...item,
            assignmentMode: item.assignmentMode || "specific",
            assignedTo: item.assignedTo?._id || item.assignedTo || "",
            scheduledDate: item.scheduledDate
              ? new Date(item.scheduledDate).toLocaleDateString("en-CA")
              : "",
            completedAt: item.completedAt
              ? new Date(item.completedAt).toLocaleDateString("en-CA")
              : today(),
          }
        : {
            scope: "",
            location: "",
            contactPerson: "",
            assignmentMode: "specific",
            assignedTo: users.find((u) => u.active)?._id || "",
            scheduledDate: today(),
          },
    );
    setModal("work");
  };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (modal === "work") {
        if (form._id) await api.patch("/work/" + form._id, form);
        else await api.post("/work", form);
      } else if (modal === "meeting") {
        const scheduledAt = indiaDateTimeToIso(form.meetingDate, form.meetingTime);
        if (!scheduledAt) {
          throw new Error("Choose a valid meeting date and time.");
        }
        const payload = {
          client: form.client,
          location: form.location,
          purpose: form.purpose,
          scheduledAt,
        };
        if (form._id) await api.patch("/meetings/" + form._id, payload);
        else await api.post("/meetings", payload);
      } else if (modal === "user") {
        await api.post("/users", form);
      }
      setModal("");
      if (modal === "work") await load();
      if (modal === "user") setUsers((await api.get("/users")).data);
      if (modal === "meeting") await refreshMeetings();
    } catch (e) {
      setError(e.response?.data?.message || "Could not save changes.");
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (item) => {
    if (isAdmin) {
      openWork(item);
      return;
    }
    try {
      await api.patch("/work/" + item._id, {
        status: "completed",
        completedAt: form.completedAt || today(),
      });
      await load();
    } catch (e) {
      setError(e.response?.data?.message || "Could not update work.");
    }
  };
  const remove = async (id) => {
    if (confirm("Delete this work item?")) {
      await api.delete("/work/" + id);
      load();
    }
  };
  const readAll = async () => {
    if (unread) {
      await api.patch("/notifications/read-all");
      load();
    }
  };
  const enable = async () => {
    setError("");
    setNotice("");
    if (
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setError("This browser does not support PWA push notifications.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setError("Allow notifications in your browser settings to receive work updates.");
      return;
    }
    try {
      const { data } = await api.get("/push/vapid-public-key");
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      const serverKey = applicationServerKey(data.publicKey);
      const installedKey = subscription?.options?.applicationServerKey;
      const keyMatches =
        !installedKey ||
        (new Uint8Array(installedKey).length === serverKey.length &&
          new Uint8Array(installedKey).every((byte, index) => byte === serverKey[index]));
      if (subscription && !keyMatches) {
        const oldEndpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await api.delete("/push/subscriptions", { data: { endpoint: oldEndpoint } });
        subscription = null;
      }
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: serverKey,
        });
      }
      await api.post("/push/subscriptions", subscription.toJSON());
      setPushEnabled(true);
      const { data: testResult } = await api.post("/push/test");
      setNotice(testResult.message);
    } catch (e) {
      setError(e.response?.data?.message || "Could not enable push notifications.");
    }
  };
  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };
  if (loading) return <main className="center">Loading Field Desk…</main>;
  if (!user)
    return (
      <main className="login-wrap">
        <form className="login card" onSubmit={signIn}>
          <div className="brandmark">FD</div>
          <p className="eyebrow">OCELLUS · FIELD TEAM</p>
          <h1>Sign in to Field Desk</h1>
          <p className="muted">Use your work account to view assigned jobs and service reports.</p>
          {error && <div className="error" role="alert">{error}</div>}
          <label htmlFor="login-name">Username</label>
          <input
            id="login-name"
            name="username"
            autoComplete="username"
            value={loginName}
            onChange={(event) => setLoginName(event.target.value)}
            required
            autoFocus
          />
          <label htmlFor="login-password">Password</label>
          <div className="password-field">
            <input
              id="login-password"
              name="password"
              type={showLoginPassword ? "text" : "password"}
              autoComplete="current-password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              required
            />
            <button type="button" className="password-toggle" onClick={() => setShowLoginPassword((value) => !value)} aria-label={showLoginPassword ? "Hide password" : "Show password"}>
              {showLoginPassword ? "Hide" : "Show"}
            </button>
          </div>
          <button className="primary full" type="submit" disabled={loginBusy}>
            {loginBusy ? "Signing in…" : "Sign in"}
          </button>
          {installPrompt && (
            <button className="secondary full login-install" type="button" onClick={installApp}>
              Install Field Desk
            </button>
          )}
          <p className="login-footnote">Your Field Desk account is managed by your administrator.</p>
        </form>
      </main>
    );
  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <div className="brandmark">FD</div>
          <div>
            <b>Field Desk</b>
            <small>
              {user.name} · {isAdmin ? "Admin" : "Worker"}
            </small>
          </div>
        </div>
        <div className="head-actions">
          <button
            className="icon-btn"
            onClick={enable}
            title={pushEnabled ? "Send a push test notification" : "Enable notifications and send a test"}
            aria-label={pushEnabled ? "Send a push test notification" : "Enable notifications and send a test"}
          >
            {pushEnabled ? "♧✓" : "♧"}
          </button>
          {installPrompt && (
            <button className="text-btn" onClick={installApp}>
              Install app
            </button>
          )}
          <button
            className="icon-btn note-btn"
            onClick={() => setPage("alerts")}
            title="Notifications"
          >
            ♢{unread > 0 && <i>{unread}</i>}
          </button>
          <button className="text-btn" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="content">
        <div className="welcome">
          <div>
            <p className="eyebrow">
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <h1>
              {page === "work"
                ? "Your work"
                : page === "meetings"
                  ? "Meetings"
                  : page === "reports"
                    ? "Service call reports"
                    : page === "team"
                      ? "Team members"
                      : "Notifications"}
            </h1>
            <p className="muted">
              {page === "work"
                ? isAdmin
                  ? "Keep the team moving."
                  : "Here is what needs your attention."
                : page === "meetings"
                  ? "Your upcoming meetings and private reminders."
                  : "A clear view of field operations."}
            </p>
          </div>
          {isAdmin && page === "work" && (
            <button className="primary" onClick={() => openWork()}>
              ＋ <span>New work</span>
            </button>
          )}
          {isSuperAdmin && page === "meetings" && (
            <button className="primary" onClick={() => openMeeting()}>
              ＋ <span>Schedule meeting</span>
            </button>
          )}
        </div>
        <nav className="tabs">
          <button
            className={page === "work" ? "active" : ""}
            onClick={() => setPage("work")}
          >
            Pending work
          </button>
          <button
            onClick={openServiceReports}
          >
            Service call report
          </button>
          <button
            className={page === "team" ? "active" : ""}
            onClick={() => setPage("team")}
          >
            Team
          </button>
          {isSuperAdmin && (
            <button
              className={page === "meetings" ? "active" : ""}
              onClick={() => setPage("meetings")}
            >
              Meetings
            </button>
          )}
        </nav>
        {error && (
          <div className="error">
            {error}
            <button onClick={() => setError("")}>×</button>
          </div>
        )}
        {notice && <div className="success">{notice}</div>}
        {page === "work" && (
          <>
            <div className="filter-row work-filters">
              <div className="seg">
                <button
                  className={status === "pending" ? "selected" : ""}
                  onClick={() => setStatus("pending")}
                >
                  Pending
                </button>
                <button
                  className={status === "completed" ? "selected" : ""}
                  onClick={() => setStatus("completed")}
                >
                  Completed
                </button>
              </div>
              <input
                className="search"
                type="search"
                placeholder="Search work, location, contact"
                aria-label="Search work, location, or contact person"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              {isAdmin && (
                <select
                  className="assignment-filter"
                  aria-label="Filter work assignment"
                  value={assignmentFilter}
                  onChange={(event) => setAssignmentFilter(event.target.value)}
                >
                  <option value="all">All assignments</option>
                  <option value="any">Any worker</option>
                  <option value="all-workers">All workers</option>
                  {users.filter((u) => u.active).map((u) => (
                    <option value={"worker:" + u._id} key={u._id}>Assigned to {u.name}</option>
                  ))}
                </select>
              )}
              <span className="muted">
                {filteredWorks.length} {status}{" "}
                {filteredWorks.length === 1 ? "item" : "items"}
              </span>
            </div>
            {filteredWorks.length === 0 ? (
              <div className="empty card">
                <div className="empty-icon">✓</div>
                <h2>{sorted.length === 0 ? "All clear" : "No matching work"}</h2>
                <p>{sorted.length === 0 ? `No ${status} work right now.` : "Try changing your search or assignment filter."}</p>
              </div>
            ) : (
              <div className="work-list">
                {filteredWorks.map((w) => (
                  <article className="work-card card" key={w._id}>
                    <div className="card-top">
                      <span className={"status " + w.status}>{w.status}</span>
                      <time>{new Date(w.createdAt).toLocaleDateString()}</time>
                    </div>
                    <h2>{w.scope}</h2>
                    <div className="details">
                      <span>⌖ {w.location}</span>
                      <span>♙ {w.contactPerson}</span>
                      {w.scheduledDate && (
                        <span>◷ Scheduled {new Date(w.scheduledDate).toLocaleDateString()}</span>
                      )}
                      {isAdmin && (
                        <span>◉ {getAssignmentLabel(w)}</span>
                      )}
                    </div>
                    {w.status === "completed" && (
                      <p className="done-date">
                        Completed {new Date(w.completedAt).toLocaleDateString()}
                      </p>
                    )}
                    <div className="card-actions">
                      {!isAdmin && w.status === "pending" && (
                        w.assignmentMode === "all" && workerCompleted(w) ? (
                          <span className="done-date">Completed by you · waiting for the team</span>
                        ) : (
                          <>
                            <label className="date-label">
                              Completion date
                              <input
                                type="date"
                                value={form.completedAt || today()}
                                onChange={(e) =>
                                  setForm({ ...form, completedAt: e.target.value })
                                }
                              />
                            </label>
                            <button className="primary" onClick={() => toggle(w)}>
                              Mark completed
                            </button>
                          </>
                        )
                      )}
                      {isAdmin && (
                        <>
                          <button
                            className="secondary"
                            onClick={() => openWork(w)}
                          >
                            Edit
                          </button>
                          <button
                            className="danger"
                            onClick={() => remove(w._id)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
        {page === "meetings" && isSuperAdmin && (
          <section className="meeting-list">
            <div className="seg meeting-views" role="tablist" aria-label="Meeting view">
              <button
                role="tab"
                aria-selected={meetingView === "upcoming"}
                className={meetingView === "upcoming" ? "selected" : ""}
                onClick={() => setMeetingView("upcoming")}
              >
                Upcoming
              </button>
              <button
                role="tab"
                aria-selected={meetingView === "history"}
                className={meetingView === "history" ? "selected" : ""}
                onClick={() => setMeetingView("history")}
              >
                History
              </button>
            </div>
            {meetings.length === 0 ? (
              <div className="empty card">
                <div className="empty-icon">◷</div>
                <h2>{meetingView === "history" ? "No past meetings" : "No upcoming meetings"}</h2>
                <p>{meetingView === "history" ? "Past meetings will appear here." : "Schedule a client meeting to receive reminders."}</p>
                {meetingView === "upcoming" && (
                  <button className="primary" onClick={() => openMeeting()}>
                    Schedule meeting
                  </button>
                )}
              </div>
            ) : (
              meetings.map((meeting) => (
                <article className="meeting-card card" key={meeting._id}>
                  <div className="card-top">
                    <span className="meeting-label">{meetingView === "history" ? "Past meeting" : "Client meeting"}</span>
                    <time>{new Date(meeting.scheduledAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST</time>
                  </div>
                  <h2>{meeting.client}</h2>
                  <div className="details">
                    <span>⌖ {meeting.location}</span>
                    <span>▤ {meeting.purpose}</span>
                  </div>
                  <div className="card-actions">
                    {meetingView === "upcoming" && (
                      <button className="secondary" onClick={() => openMeeting(meeting)}>Edit</button>
                    )}
                    <button className="danger" onClick={() => removeMeeting(meeting._id)}>Delete</button>
                  </div>
                </article>
              ))
            )}
          </section>
        )}
        {page === "reports" && (
          <section className="card">
            <h2>Service Call Report</h2>
            <p className="muted">Open the shared report system to create, view, and print reports.</p>
            <button className="primary" onClick={openServiceReports}>Open Service Call Reports</button>
          </section>
        )}
        {page === "team" && (
          <section className="card team">
            <div className="section-head">
              <div>
                <h2>Workers</h2>
                <p className="muted">Accounts with access to assigned work.</p>
              </div>
              {isAdmin && (
                <button
                  className="primary"
                  onClick={() => {
                    setForm({ name: "", password: "" });
                    setModal("user");
                  }}
                >
                  ＋ Add worker
                </button>
              )}
            </div>
            {isAdmin ? (
              users.map((u) => (
                <div className="user-row" key={u._id}>
                  <span className="avatar">
                    {u.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <b>{u.name}</b>
                    <small>{u.active ? "Active" : "Disabled"}</small>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">Only admins can manage team accounts.</p>
            )}
          </section>
        )}
        {page === "alerts" && (
          <section className="note-list">
            {notes.length ? (
              notes.map((n) => (
                <article
                  className={"card note " + (!n.readAt ? "unread" : "")}
                  key={n._id}
                >
                  <b>{n.title}</b>
                  <p>{n.message}</p>
                  <small>{new Date(n.createdAt).toLocaleString()}</small>
                </article>
              ))
            ) : (
              <div className="empty card">You're all caught up.</div>
            )}
            {unread > 0 && (
              <button className="secondary" onClick={readAll}>
                Mark all read
              </button>
            )}
            {notesPages > 1 && (
              <div className="notification-pagination" aria-label="Notification pages">
                <button
                  className="secondary"
                  disabled={notesPage <= 1}
                  onClick={() => setNotesPage((current) => current - 1)}
                >
                  Newer
                </button>
                <span>Page {notesPage} of {notesPages}</span>
                <button
                  className="secondary"
                  disabled={notesPage >= notesPages}
                  onClick={() => setNotesPage((current) => current + 1)}
                >
                  Older
                </button>
              </div>
            )}
          </section>
        )}
      </main>
      <nav className="mobile-nav">
        <button
          onClick={() => setPage("work")}
          className={page === "work" ? "active" : ""}
        >
          ▣<span>Work</span>
        </button>
        <button
          onClick={openServiceReports}
        >
          ▤<span>Reports</span>
        </button>
        <button
          onClick={() => setPage("team")}
          className={page === "team" ? "active" : ""}
        >
          ♙<span>Team</span>
        </button>
        {isSuperAdmin && (
          <button
            onClick={() => setPage("meetings")}
            className={page === "meetings" ? "active" : ""}
          >
            ◷<span>Meetings</span>
          </button>
        )}
        <button
          onClick={() => setPage("alerts")}
          className={page === "alerts" ? "active" : ""}
        >
          ♢<span>Alerts{unread ? " · " + unread : ""}</span>
        </button>
      </nav>
      {modal && (
        <div className="scrim" onClick={() => setModal("")}>
          <form
            className="modal card"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
          >
            <div className="section-head">
              <h2>
                {modal === "user"
                  ? "Add worker"
                  : modal === "meeting"
                    ? form._id ? "Edit meeting" : "Schedule meeting"
                    : form._id ? "Edit work" : "New work"}
              </h2>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setModal("")}
              >
                ×
              </button>
            </div>
            {modal === "user" ? (
              <>
                <label>
                  Worker name
                  <input
                    value={form.name || ""}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Temporary password
                  <input
                    type="password"
                    minLength="8"
                    value={form.password || ""}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    required
                  />
                  <small>
                    At least 8 characters. Share this directly with the worker.
                  </small>
                </label>
              </>
            ) : modal === "meeting" ? (
              <>
                <label>
                  Client
                  <input
                    value={form.client || ""}
                    onChange={(event) => setForm({ ...form, client: event.target.value })}
                    maxLength="200"
                    required
                  />
                </label>
                <div className="meeting-date-time">
                  <label>
                    Meeting date
                    <input
                      type="date"
                      value={form.meetingDate || ""}
                      onChange={(event) => setForm({ ...form, meetingDate: event.target.value })}
                      required
                    />
                  </label>
                  <label>
                    Meeting time
                    <input
                      type="time"
                      value={form.meetingTime || ""}
                      onChange={(event) => setForm({ ...form, meetingTime: event.target.value })}
                      required
                    />
                  </label>
                </div>
                <small className="meeting-timezone">Times are in India Standard Time (IST). Only you can see this meeting and its reminders.</small>
                <label>
                  Location
                  <input
                    value={form.location || ""}
                    onChange={(event) => setForm({ ...form, location: event.target.value })}
                    maxLength="300"
                    required
                  />
                </label>
                <label>
                  Meeting purpose
                  <textarea
                    rows="3"
                    value={form.purpose || ""}
                    onChange={(event) => setForm({ ...form, purpose: event.target.value })}
                    maxLength="2000"
                    required
                  />
                </label>
                <div className="meeting-reminder-note">
                  Reminders: 24h, 12h, 6h, 3h, and 30 minutes before; a final reminder arrives at meeting time.
                </div>
              </>
            ) : (
              <>
                <label>
                  Scope of work
                  <textarea
                    rows="3"
                    value={form.scope || ""}
                    onChange={(e) =>
                      setForm({ ...form, scope: e.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Location
                  <input
                    value={form.location || ""}
                    onChange={(e) =>
                      setForm({ ...form, location: e.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Contact person
                  <input
                    value={form.contactPerson || ""}
                    onChange={(e) =>
                      setForm({ ...form, contactPerson: e.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Scheduled date
                  <input
                    type="date"
                    value={form.scheduledDate || ""}
                    onChange={(event) =>
                      setForm({ ...form, scheduledDate: event.target.value })
                    }
                    required={!form._id}
                  />
                </label>
                <label>
                  Assign to
                  <select
                    value={form.assignmentMode === "specific" ? form.assignedTo || "" : form.assignmentMode}
                    onChange={(e) => {
                      const value = e.target.value;
                      setForm({
                        ...form,
                        assignmentMode: value === "any" || value === "all" ? value : "specific",
                        assignedTo: value === "any" || value === "all" ? "" : value,
                      });
                    }}
                    required
                  >
                    <option value="">Choose a worker</option>
                    <option value="any">Any worker · one person completes it</option>
                    <option value="all">All workers · everyone completes it</option>
                    {users
                      .filter((u) => u.active)
                      .map((u) => (
                        <option value={u._id} key={u._id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setModal("")}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy
                  ? "Saving…"
                  : modal === "user"
                    ? "Create account"
                    : modal === "meeting"
                      ? form._id ? "Save meeting" : "Schedule meeting"
                      : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;

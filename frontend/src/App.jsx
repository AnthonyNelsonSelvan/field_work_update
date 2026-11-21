import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
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
    [works, setWorks] = useState([]),
    [users, setUsers] = useState([]),
    [notes, setNotes] = useState([]),
    [error, setError] = useState(""),
    [modal, setModal] = useState(""),
    [form, setForm] = useState({ completedAt: today() }),
    [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const isAdmin = user?.role === "admin";
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [w, n] = await Promise.all([
        api.get("/work", { params: { status } }),
        api.get("/notifications"),
      ]);
      setWorks(w.data);
      setNotes(n.data);
    } catch (e) {
      setError(e.response?.data?.message || "Could not load your data.");
    }
  }, [user, status]);
  useEffect(() => {
    api
      .get("/auth/me")
      .then((r) => setUser(r.data.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (loading || user) return;
    const loginUrl = new URL("/admin/login/onlyAdmins", INVOICE_APP_URL);
    loginUrl.searchParams.set("returnTo", window.location.href);
    window.location.replace(loginUrl.toString());
  }, [loading, user]);
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
  const unread = notes.filter((n) => !n.readAt).length,
    sorted = useMemo(
      () =>
        [...works].sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
        ),
      [works],
    );
  const openServiceReports = () =>
    window.location.assign(new URL("/admin/service-call-reports", INVOICE_APP_URL).toString());
  const logout = async () => {
    await api.post("/auth/logout");
    setUser(null);
  };
  const openWork = (item) => {
    setForm(
      item
        ? {
            ...item,
            assignedTo: item.assignedTo?._id || "",
            completedAt: item.completedAt
              ? new Date(item.completedAt).toLocaleDateString("en-CA")
              : today(),
          }
        : {
            scope: "",
            location: "",
            contactPerson: "",
            assignedTo: users.find((u) => u.active)?._id || "",
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
      } else if (modal === "user") await api.post("/users", form);
      setModal("");
      await load();
      if (modal === "user") setUsers((await api.get("/users")).data);
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
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(data.publicKey),
        });
      }
      await api.post("/push/subscriptions", subscription.toJSON());
      setPushEnabled(true);
      setNotice("Push notifications are enabled on this device.");
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
        <section className="login card">
          <div className="brandmark">FD</div>
          <p className="eyebrow">OCELLUS · FIELD TEAM</p>
          <h1>Opening shared sign in…</h1>
          <p className="muted">Use your Invoice Generator account to continue.</p>
        </section>
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
            title={pushEnabled ? "Push notifications enabled" : "Enable push notifications"}
            aria-label={pushEnabled ? "Push notifications enabled" : "Enable push notifications"}
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
                : "A clear view of field operations."}
            </p>
          </div>
          {isAdmin && page === "work" && (
            <button className="primary" onClick={() => openWork()}>
              ＋ <span>New work</span>
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
            <div className="filter-row">
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
              <span className="muted">
                {sorted.length} {status}{" "}
                {sorted.length === 1 ? "item" : "items"}
              </span>
            </div>
            {sorted.length === 0 ? (
              <div className="empty card">
                <div className="empty-icon">✓</div>
                <h2>All clear</h2>
                <p>No {status} work right now.</p>
              </div>
            ) : (
              <div className="work-list">
                {sorted.map((w) => (
                  <article className="work-card card" key={w._id}>
                    <div className="card-top">
                      <span className={"status " + w.status}>{w.status}</span>
                      <time>{new Date(w.createdAt).toLocaleDateString()}</time>
                    </div>
                    <h2>{w.scope}</h2>
                    <div className="details">
                      <span>⌖ {w.location}</span>
                      <span>♙ {w.contactPerson}</span>
                      {isAdmin && <span>◉ {w.assignedTo?.name}</span>}
                    </div>
                    {w.status === "completed" && (
                      <p className="done-date">
                        Completed {new Date(w.completedAt).toLocaleDateString()}
                      </p>
                    )}
                    <div className="card-actions">
                      {!isAdmin && w.status === "pending" && (
                        <>
                          <label className="date-label">
                            Completion date
                            <input
                              type="date"
                              value={form.completedAt || today()}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  completedAt: e.target.value,
                                })
                              }
                            />
                          </label>
                          <button className="primary" onClick={() => toggle(w)}>
                            Mark completed
                          </button>
                        </>
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
                {modal === "user" ? "Add worker" : form._id ? "Edit work" : "New work"}
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
                  Assign to
                  <select
                    value={form.assignedTo || ""}
                    onChange={(e) =>
                      setForm({ ...form, assignedTo: e.target.value })
                    }
                    required
                  >
                    <option value="">Select worker</option>
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

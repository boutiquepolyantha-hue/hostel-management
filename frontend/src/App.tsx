import {
  ArrowLeftRight,
  Bell,
  Building2,
  Bus,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Home,
  LogOut,
  MapPin,
  MessageCircle,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";

import { api } from "./api";
import { StudentApp, StudentKiosk } from "./student/StudentApp";
import { GuardianKiosk } from "./guardian/GuardianKiosk";
import type {
  Building,
  BusPassenger,
  BusTrip,
  DashboardData,
  EntryExitData,
  GuardianLink,
  Supervisor,
  TamamData,
} from "./types";

const UAE_CITIES = [
  "Al Shahama",
  "Khor Fakkan",
  "Bani Yas",
  "Al Ain",
  "Dubai",
  "Sharjah",
  "Fujairah",
  "Ras Al Khaimah",
  "Khalifa City",
  "Mohammed Bin Zayed City",
  "Al Rahba",
  "Al Samha",
  "Madinat Zayed",
  "Ruwais",
  "Ghayathi",
];
let tamamResetHandled = false;
function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone =
    normalized.includes("fail") ||
    normalized.includes("reject") ||
    normalized.includes("not_")
      ? "danger"
      : normalized.includes("pending") ||
          normalized.includes("outside") ||
          normalized.includes("check_out")
        ? "warning"
        : normalized.includes("approved") ||
            normalized.includes("verified") ||
            normalized.includes("completed") ||
            normalized.includes("inside") ||
            normalized.includes("boarded") ||
            normalized.includes("check_in")
          ? "success"
          : "info";
  return (
    <span className={`badge ${tone}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}
function PhoneLink({
  phone,
  studentName,
  whatsappReminder = false,
}: {
  phone?: string | null;
  studentName?: string;
  whatsappReminder?: boolean;
}) {
  if (!phone) return <span>—</span>;

  const telephoneNumber = phone.replace(/[^\d+]/g, "");

  let whatsappNumber = phone.replace(/\D/g, "");

  if (whatsappNumber.startsWith("0")) {
    whatsappNumber = `971${whatsappNumber.slice(1)}`;
  }

  const message = encodeURIComponent(
    `Hello ${studentName ?? "student"}, please remember to complete your daily Tamam.`,
  );

  const link = whatsappReminder
    ? `https://wa.me/${whatsappNumber}?text=${message}`
    : `tel:${telephoneNumber}`;

  return (
    <a
      className="phone-link"
      href={link}
      target={whatsappReminder ? "_blank" : undefined}
      rel={whatsappReminder ? "noopener noreferrer" : undefined}
      onClick={(event) => event.stopPropagation()}
    >
      {phone}
    </a>
  );
}

function StatCard({
  label,
  value,
  tone = "blue",
  icon,
}: {
  label: string;
  value: number | string;
  tone?: string;
  icon: ReactNode;
}) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div>
        <p>{label}</p>
        <strong className={tone}>{value}</strong>
      </div>
    </article>
  );
}


function Loading() {
  return (
    <div className="loading">
      <div className="spinner" />
      <p>Loading records…</p>
    </div>
  );
}

function UserSelectionButton() {
  const navigate = useNavigate();
  const location = useLocation();

  if (location.pathname === "/") return null;

  
}


function PortalHome() {
  const navigate = useNavigate();
  return (
    <main className="portal-home">
      <section className="portal-hero">
        <p className="eyebrow">Residence management</p>
        <h1>Welcome to the Hostel System</h1>
        <p>Select your portal to continue</p>
        <div className="portal-choices">
          <button onClick={() => navigate("/admin/login")}>
            <div className="portal-picture"><Building2 size={100} strokeWidth={1.2} /></div>
            <h2>Administration</h2>
            <p>Buildings, entry and exit, Tamam, buses and guardian approvals.</p>
            <span>Administration login <ChevronRight size={18} /></span>
          </button>
          <button onClick={() => navigate("/student")}>
            <div className="portal-picture"><UserCheck size={92} strokeWidth={1.2} /></div>
            <h2>Student</h2>
            <p>Residence services, digital ID, face verification and secure QR.</p>
            <span>Student login <ChevronRight size={18} /></span>
          </button>
          <button onClick={() => navigate("/kiosk/guardian")}>
            <div className="portal-picture"><ShieldCheck size={96} strokeWidth={1.2} /></div>
            <h2>Guardian</h2>
            <p>Face identification and authorized student check-in or check-out.</p>
            <span>Guardian login <ChevronRight size={18} /></span>
          </button>
        </div>
      </section>
    </main>
  );
}


function StudentPortal() {
  const navigate = useNavigate();
  return (
    <main className="student-portal-page">
      <button className="back-link" onClick={() => navigate("/")}>
        ← Back to portals
      </button>
      <section className="student-portal-card">
        <div>
          <p className="eyebrow">Student & guardian</p>
          <h1>Your secure access portal</h1>
          <p className="muted">
            This package focuses on the complete supervisor administration module.
            Guardian registration, student QR and camera verification connect here
            during the next implementation phase.
          </p>
        </div>
        <div className="student-feature-grid">
          <article><UserCheck /><h2>Guardian account</h2><p>Register and request a student relationship.</p></article>
          <article><ShieldCheck /><h2>Identity verification</h2><p>Complete guardian and student face verification.</p></article>
          <article><ArrowLeftRight /><h2>Entry & exit</h2><p>Request approved student check-in or check-out.</p></article>
          <article><ClipboardCheck /><h2>Student QR</h2><p>Display the secure, single-use verification QR.</p></article>
        </div>
      </section>
    </main>
  );
}


function LoginPage({ onLogin }: { onLogin: (user: Supervisor) => void }) {
  const [email, setEmail] = useState("mariam.saeed@hostel.local");
  const [password, setPassword] = useState("Supervisor123!");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const user = await api<Supervisor>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      onLogin(user);
      navigate("/admin/buildings");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-art">
        <div className="login-brand">
          <ShieldCheck size={38} />
          <span>Residence Management</span>
        </div>
        <div className="building-art">
          <Building2 size={170} strokeWidth={1.1} />
        </div>
        <h1>Safe residences.<br />Smarter supervision.</h1>
        <p>Monitor every building, student movement, Tamam and bus trip.</p>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="mobile-brand">
            <ShieldCheck size={34} /> Residence Management
          </div>
          <p className="eyebrow">Authorized access</p>
          <h2>Dorm Supervisor Login</h2>
          <p className="muted">Enter your details to access assigned buildings.</p>
          <label>
            Work email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <div className="error-message">{error}</div>}
          <button className="primary-button full-button" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="button"
            className="secondary-button full-button"
            onClick={() => navigate("/")}
          >
            Back to user selection
          </button>
          <div className="login-security">
            <ShieldCheck size={17} />
            Authorized supervisors only
          </div>
        </form>
      </section>
    </main>
  );
}


function BuildingSelection({
  user,
  onLogout,
}: {
  user: Supervisor;
  onLogout: () => void;
}) {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api<Building[]>("/buildings").then(setBuildings).catch((reason) => {
      setError(reason.message);
    });
  }, []);

  return (
    <div className="selection-page">
      <Topbar user={user} onLogout={onLogout} />
      <main className="selection-content">
        <p className="eyebrow">Assigned residences</p>
        <h1>Select a Building</h1>
        <p className="muted">Choose a building to view and manage its records.</p>
        {error && <div className="error-message">{error}</div>}
        {!buildings.length && !error ? (
          <Loading />
        ) : (
          <section className="building-grid">
            {buildings.map((building) => (
              <article className="building-card" key={building.id}>
                <div className="building-card-art">
                  <Building2 size={112} strokeWidth={1.2} />
                </div>
                <div className="building-card-title">
                  <div>
                    <h2>{building.name}</h2>
                    <StatusBadge value={building.is_active ? "active" : "inactive"} />
                  </div>
                  <span>{building.code}</span>
                </div>
                <div className="building-stats">
                  <div><Users /><strong>{building.registered_students}</strong><span>Students</span></div>
                  <div><UserCheck /><strong>{building.currently_inside}</strong><span>Inside</span></div>
                  <div><Bell /><strong>{building.alerts}</strong><span>Alerts</span></div>
                </div>
                <button
                  className="primary-button full-button"
                  onClick={() => navigate(`/admin/buildings/${building.id}`)}
                >
                  Open building <ChevronRight size={18} />
                </button>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}


function Topbar({
  user,
  onLogout,
}: {
  user: Supervisor;
  onLogout: () => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <ShieldCheck />
        <span>Residence Management</span>
      </div>
      <div className="topbar-user">
        <Bell size={21} />
        <div className="avatar">
          {user.full_name.split(" ").map((part) => part[0]).join("").slice(0, 2)}
        </div>
        <div>
          <strong>{user.full_name}</strong>
          <span>{user.role}</span>
        </div>
        <button className="text-button" onClick={onLogout}>
          <LogOut size={18} /> Sign out
        </button>
      </div>
    </header>
  );
}


const NAVIGATION = [
  { key: "overview", label: "Overview", icon: <Home /> },
  { key: "assistant", label: "AI Assistant", icon: <MessageCircle /> },
  { key: "tamam", label: "Daily Tamam", icon: <ClipboardCheck /> },
  { key: "buses", label: "Bus Trips", icon: <Bus /> },
  { key: "guardians", label: "Guardian Approvals", icon: <ShieldCheck /> },
  { key: "users", label: "Add Users", icon: <UserPlus /> },
  {key: "student-management",label: "User Management",icon: <UserPlus />,},
];


function AdminLayout({
  user,
  onLogout,
}: {
  user: Supervisor;
  onLogout: () => void;
}) {
  const { buildingId = "1", section = "overview" } = useParams();
  const navigate = useNavigate();
  const id = Number(buildingId);

  async function exportBuildingData() {
    const data = await api<{ items: Array<Record<string, unknown>> }>(`/buildings/${id}/students?limit=300`);
    const headers = ["Student ID", "Name", "Email", "Phone", "City", "Room", "Current status"];
    const rows = data.items.map((student) => [student.university_id, student.full_name, student.email, student.phone, student.city, student.room_number, student.current_status]);
    const csv = [headers, ...rows].map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `building-${id}-students.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div className="admin-shell">
      <Topbar user={user} onLogout={onLogout} />
      <aside className="sidebar">
        <nav>
          {NAVIGATION.map((item) => (
            <button
              key={item.key}
              className={section === item.key ? "active" : ""}
              onClick={() =>
                navigate(
                  item.key === "overview"
                    ? `/admin/buildings/${id}`
                    : `/admin/buildings/${id}/${item.key}`,
                )
              }
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <button
          className="switch-building"
          onClick={() => navigate("/admin/buildings")}
        >
          <Building2 size={20} /> Switch building
        </button>
      </aside>
      <main className="admin-content">
        <button className="secondary-button page-export" onClick={exportBuildingData}>Export to Excel</button>
        {section === "overview" && <Overview buildingId={id} />}
        {section === "assistant" && (<AdminAssistant buildingId={id} />)}     
        {section === "tamam" && <Tamam buildingId={id} />}
        {section === "buses" && <Buses buildingId={id} />}
        {section === "guardians" && <GuardianApprovals buildingId={id} />}
        {section === "users" && <UserManagement buildingId={id} />}
        {section === "student-management" && (<StudentManagement buildingId={id} />)}
      </main>
    </div>
  );
}


function AdminAssistant({
  buildingId,
}: {
  buildingId: number;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [items, setItems] = useState<
    Array<Record<string, string>>
  >([]);
  const [loading, setLoading] = useState(false);

  const promptGroups = {
    "Students": [
      "Which students have no guardian?",
      "Which students have no face enrollment?",
      "Add a student.",
      "Edit a student such as: Move a student to another room , Move a student to another building , etc ",
    ],

    "Guardians": [
      "Show all guardians.",
      "Show a guardian’s complete profile.",
      "Add a guardian.",
      "Edit a guardian.",
      "Enroll or update a guardian face.",
    ],

    "Entry & Exit": [
      "Show students currently inside.",
      "Show students currently outside.",],



  "Tamam & Buses": [
  "Export the Tamam report.",
  "Change a student to another bus.",
  "Export the bus report.",
    ],

    
  };

  const ask = async (value = question) => {
  if (!value.trim()) return;

  setQuestion(value);
  setLoading(true);

  try {
    const result = await api<{
      answer: string;
      items: Array<Record<string, string>>;
    }>("/admin/assistant", {
      method: "POST",
      body: JSON.stringify({
        question: value,
        building_id: buildingId,
      }),
    });

    setAnswer(result.answer);
    setItems(result.items ?? []);
  } catch (reason) {
    setAnswer(
      reason instanceof Error
        ? reason.message
        : "Assistant unavailable",
    );
    setItems([]);
  } finally {
    setLoading(false);
  }
};

const exportAssistantResults = async (
  exportBuildingId: number | null,
) => {
  if (!question.trim()) return;

  const result = await api<{
    answer: string;
    items: Array<Record<string, string>>;
  }>("/admin/assistant", {
    method: "POST",
    body: JSON.stringify({
      question,
      building_id: exportBuildingId,
    }),
  });

  const resultItems = result.items ?? [];

  if (!resultItems.length) {
    setAnswer(
      "No records are available for this export.",
    );
    return;
  }

  const isGuardianExport = question
    .toLowerCase()
    .includes("show all guardians");

  const exportItems: Array<
    Record<string, string>
  > = isGuardianExport
    ? resultItems.flatMap((item) => {
        const guardianEntries = String(
          item.guardian_names ?? "",
        )
          .split(" | ")
          .filter(Boolean);

        return guardianEntries.map(
          (entry, index) => {
            const match = entry.match(
              /^(.*)\s+\(([^()]*)\)$/,
            );

            return {
              Student:
                index === 0
                  ? String(item.student ?? "")
                  : "",
              ID:
                index === 0
                  ? String(
                      item.university_id ?? "",
                    )
                  : "",
              Guardian:
                match?.[1] ?? entry,
              Relation:
                match?.[2] ?? "",
            };
          },
        );
      })
    : resultItems;

  const headers = Array.from(
    new Set(
      exportItems.flatMap((item) =>
        Object.keys(item),
      ),
    ),
  );

  const rows = exportItems.map((item) =>
    headers.map(
      (header) => item[header] ?? "",
    ),
  );

  const csv = [
    headers,
    ...rows,
  ]
    .map((row) =>
      row
        .map(
          (value) =>
            `"${String(value).replace(
              /"/g,
              '""',
            )}"`,
        )
        .join(","),
    )
    .join("\n");
  const blob = new Blob(
    ["\uFEFF", csv],
    {
      type: "text/csv;charset=utf-8;",
    },
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download =
  exportBuildingId === null
    ? "buildings-1-and-2-report.csv"
    : `building-${exportBuildingId}-report.csv`;
  link.click();

  URL.revokeObjectURL(url);
};

  return (
    <section className="assistant-card">
      <p className="eyebrow">
        Grounded in your saved records
      </p>

      <h1>
        <MessageCircle />
        AI Administration Assistant
      </h1>

      <p className="muted">
        Ask about students outside, late check-outs,
        or pending guardian approvals.
      </p>

      {Object.entries(promptGroups).map(
        ([group, prompts]) => (
          <div
            className="assistant-group"
            key={group}
          >
            <h3>{group}</h3>

            <div className="assistant-prompts">
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => ask(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ),
      )}

      {answer && (
        <div className="assistant-answer">
          <strong>{answer}</strong>

          {items.length > 0 && (
            <>
              <div className="assistant-prompts">
  <button
    className="secondary-button"
    type="button"
    disabled={loading}
    onClick={() =>
      exportAssistantResults(buildingId)
    }
  >
    Export Building {buildingId} Only
  </button>

  <button
    className="secondary-button"
    type="button"
    disabled={loading}
    onClick={() =>
      exportAssistantResults(null)
    }
  >
    Export Buildings 1 & 2
  </button>
</div>

              <ul>
                {items.map((item, index) => (
                  <li key={index}>
                    {Object.entries(item)
                      .map(
                        ([key, value]) =>
                          `${key.replaceAll(
                            "_",
                            " ",
                          )}: ${value}`,
                      )
                      .join(" · ")}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
function StudentManagement({
  buildingId,
}: {
  buildingId: number;
}) {
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [editingStudent, setEditingStudent] =
    useState<any | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadStudents = () => {
    api<any[]>(
      `/buildings/${buildingId}/students?search=${encodeURIComponent(
        search,
      )}&limit=300`,
    )
      .then((result: any) => { setStudents(Array.isArray(result)? result: result.items ?? [],);})
      .catch((reason) => setError(reason.message));
  };

  useEffect(() => {
    const timer = window.setTimeout(
      loadStudents,
      200,
    );

    return () => window.clearTimeout(timer);
  }, [buildingId, search]);

  async function saveStudent(event: FormEvent) {
    event.preventDefault();

    if (!editingStudent) return;

    setSaving(true);
    setMessage("");
    setError("");

    try {
      await api(
        `/admin/students/${editingStudent.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            full_name: editingStudent.full_name,
            university_id:
              editingStudent.university_id,
            email: editingStudent.email,
            phone: editingStudent.phone,
            city: editingStudent.city,
            building_id: Number(
              editingStudent.building_id,
            ),
            room_number:
              editingStudent.room_number,
            current_status:
              editingStudent.current_status,
            is_active:
              editingStudent.is_active ?? true,
            password:
              newPassword.trim() || null,
          }),
        },
      );

      setMessage(
        "Student information updated successfully.",
      );
      setEditingStudent(null);
      setNewPassword("");
      loadStudents();
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }
   async function removeStudent(student: any) {
     const confirmed = window.confirm(
    `Permanently delete ${student.full_name}?\n\nThis will also remove the student's Tamam, bus, and entry/exit records.`,
  );

  if (!confirmed) return;

  setMessage("");
  setError("");

  try {
    await api(
      `/admin/students/${student.id}`,
      {
        method: "DELETE",
      },
    );

    setMessage(
      `${student.full_name} was permanently deleted.`,
    );

    if (editingStudent?.id === student.id) {
      setEditingStudent(null);
      setNewPassword("");
    }

    loadStudents();
  } catch (reason: any) {
    setError(reason.message);
  }
  }

  return (
    <section className="user-management-page">
      <PageTitle
        title="Student Management"
        subtitle="Search and update registered student accounts."
      />

      {message && (
        <div className="success-message">
          {message}
        </div>
      )}

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}



      {editingStudent && (
        <form
          className="user-form-card"
          onSubmit={saveStudent}
        >
          <div className="form-section-heading">
            <div>
              <h2>Edit student</h2>
              <p>
                Leave the password empty to keep
                the current password.
              </p>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Full name
              <input
                required
                value={editingStudent.full_name}
                onChange={(event) =>
                  setEditingStudent({
                    ...editingStudent,
                    full_name:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              University ID
              <input
                required
                value={
                  editingStudent.university_id
                }
                onChange={(event) =>
                  setEditingStudent({
                    ...editingStudent,
                    university_id:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              Email
              <input
                required
                type="email"
                value={editingStudent.email}
                onChange={(event) =>
                  setEditingStudent({
                    ...editingStudent,
                    email: event.target.value,
                  })
                }
              />
            </label>

            <label>
              Phone
              <input
                required
                type="tel"
                value={editingStudent.phone}
                onChange={(event) =>
                  setEditingStudent({
                    ...editingStudent,
                    phone: event.target.value,
                  })
                }
              />
            </label>

            <label>
              UAE city
              <select
                required
                value={editingStudent.city}
                onChange={(event) =>
                  setEditingStudent({
                    ...editingStudent,
                    city: event.target.value,
                  })
                }
              >
                {UAE_CITIES.map((city) => (
                  <option key={city}>
                    {city}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Building
              <input
                required
                type="number"
                min="1"
                value={
                  editingStudent.building_id
                }
                onChange={(event) =>
                  setEditingStudent({
                    ...editingStudent,
                    building_id:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              Room number
              <input
                required
                value={
                  editingStudent.room_number
                }
                onChange={(event) =>
                  setEditingStudent({
                    ...editingStudent,
                    room_number:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              Residence status
              <select
                value={
                  editingStudent.current_status
                }
                onChange={(event) =>
                  setEditingStudent({
                    ...editingStudent,
                    current_status:
                      event.target.value,
                  })
                }
              >
                <option value="inside">
                  Inside
                </option>
                <option value="outside">
                  Outside
                </option>
              </select>
            </label>

            <label>
              New permanent password
              <input
                type="password"
                minLength={8}
                value={newPassword}
                onChange={(event) =>
                  setNewPassword(
                    event.target.value,
                  )
                }
                placeholder="Leave empty to keep current password"
              />
            </label>
          </div>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={
                editingStudent.is_active ?? true
              }
              onChange={(event) =>
                setEditingStudent({
                  ...editingStudent,
                  is_active:
                    event.target.checked,
                })
              }
            />
            Active student account
          </label>

          <div className="form-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={saving}
            >
              {saving
                ? "Saving…"
                : "Save changes"}
            </button>

            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setEditingStudent(null);
                setNewPassword("");
              }}
            >
              Cancel
            </button>
          </div>
        </form> )}







      <section className="panel">
        <div className="panel-heading">
          <h2>Registered students</h2>
        </div>

        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search name, university ID, or email"
        />

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Actions</th>
                <th>Student Name</th>
                <th>University ID</th>
                <th>Email</th>
                <th>Building</th>
                <th>Room</th>
              </tr>
            </thead>

            <tbody>
              {students.map((student) => (
                <tr key={student.id}>
                 <td>
  <div className="form-actions">
    <button
      type="button"
      className="secondary-button"
      onClick={() => {
        setEditingStudent({
          ...student,
          is_active:
            student.is_active ?? true,
        });
        setNewPassword("");
        setMessage("");
        setError("");
      }}
    >
      Edit
    </button>

    <button
      type="button"
      className="secondary-button"
      style={{
        color: "#c62828",
        borderColor: "#c62828",
      }}
      onClick={() =>
        removeStudent(student)
      }
    >
      Remove
    </button>
  </div>
</td>

                  <td>
                    <strong>
                      {student.full_name}
                    </strong>
                  </td>

                  <td>
                    {student.university_id}
                  </td>

                  <td>{student.email}</td>

                  <td>
                    B{student.building_id}
                  </td>

                  <td>{student.room_number}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {!students.length && (
            <div className="empty-state">
              No matching students.
            </div>
          )}
        </div>
      </section>

     
    
    </section>
  );
}

function UserManagement({ buildingId }: { buildingId: number }) {
  const [tab, setTab] = useState<"student" | "guardian">("student");
    const [guardianMode, setGuardianMode] =
    useState<"new" | "existing">("new");

  const [
    existingGuardianLink,
    setExistingGuardianLink,
  ] = useState({
    guardian_identifier: "",
    student_university_id: "",
    relationship: "",
  });
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [roomError, setRoomError] = useState("");
  const [saving, setSaving] = useState(false);
  const [guardianFaceKey, setGuardianFaceKey] = useState(0);
  const [student, setStudent] = useState({
    full_name: "",
    university_id: "",
    email: "",
    password: "",
    phone: "",
    city: "",
    building_id: String(buildingId),
    room_number: "",
    current_status: "inside",
    is_active: true,
    face_image: null as string | null,
  });
  const [guardian, setGuardian] = useState({
    student_university_id: "",
    full_name: "",
    emirates_id: "",
    email: "",
    password: "",
    phone: "",
    city: "",
    relationship: "",
    is_active: true,
    face_image: null as string | null,
  });

  useEffect(() => {
    api<Building[]>("/buildings").then((items) => {
      setBuildings(items);
      if (!student.building_id && items[0]) {
        setStudent((current) => ({ ...current, building_id: String(items[0].id) }));
      }
    }).catch((reason) => setError(reason.message));
  }, [student.building_id]);
  useEffect(() => {
  const roomNumber = student.room_number.trim();

  if (!roomNumber || !student.building_id) {
    setRoomError("");
    return;
  }

  const timer = window.setTimeout(async () => {
    try {
      const result = await api<{
        available: boolean;
        occupant: string | null;
      }>(
        `/buildings/${student.building_id}/rooms/${encodeURIComponent(roomNumber)}/availability`,
      );

      if (result.available) {
        setRoomError("");
      } else {
        setRoomError(
          `This room is already occupied by ${result.occupant}.`,
        );
      }
    } catch {
      setRoomError("Unable to check room availability.");
    }
  }, 400);

  return () => window.clearTimeout(timer);
}, [student.building_id, student.room_number]);

  function resetMessages() {
    setError("");
    setMessage("");
  }

  async function submitStudent(event: FormEvent) {
    event.preventDefault();
    resetMessages();
    if (!student.face_image) {
      setError("Capture the student's face before creating the account.");
      return;
    }
    setSaving(true);
    try {
      await api("/admin/students", {
        method: "POST",
        body: JSON.stringify({ ...student, building_id: Number(student.building_id) }),
      });
      setMessage("Student account created and face enrollment saved.");
      setStudent((current) => ({ ...current, full_name: "", university_id: "", email: "", password: "", phone: "", city: "", room_number: "", face_image: null }));
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }
  async function submitExistingGuardianLink(
    event: FormEvent,
  ) {
    event.preventDefault();
    resetMessages();
    setSaving(true);

    try {
      const result = await api<{
        message: string;
        guardian: string;
        student: string;
        relationship: string;
      }>(
        "/admin/guardians/link-existing",
        {
          method: "POST",
          body: JSON.stringify(
            existingGuardianLink,
          ),
        },
      );

      setMessage(
        `${result.guardian} was linked to ` +
          `${result.student} as ` +
          `${result.relationship}.`,
      );

      setExistingGuardianLink({
        guardian_identifier: "",
        student_university_id: "",
        relationship: "",
      });
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }
  async function submitGuardian(event: FormEvent) {
    event.preventDefault();
    resetMessages();
    if (!guardian.face_image) {
      setError("Capture the guardian's face before creating the account.");
      return;
    }
    setSaving(true);
    try {
      await api("/admin/guardians", { method: "POST", body: JSON.stringify(guardian) });
      setMessage("Guardian account created, face enrollment saved, and access approved.");
      setGuardianFaceKey((current) => current + 1);
      setGuardian((current) => ({ ...current, student_university_id: "", full_name: "", emirates_id: "", email: "", password: "", phone: "", city: "", relationship: "", face_image: null }));
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }


  return (
    <section className="user-management-page">
      <PageTitle title="Add users" subtitle="Create student and guardian accounts for the selected building." />
      <div className="user-tabs">
        <button className={tab === "student" ? "active" : ""} onClick={() => { setTab("student"); resetMessages(); }}><UserCheck size={18} /> Student</button>
        <button className={tab === "guardian" ? "active" : ""} onClick={() => { setTab("guardian"); resetMessages(); }}><ShieldCheck size={18} /> Guardian</button>
      </div>
      {message && <div className="success-message">{message}</div>}
      {error && <div className="error-message">{error}</div>}
      {tab === "student" ? (
        <form className="user-form-card" onSubmit={submitStudent}>
          <div className="form-section-heading"><UserCheck /><div><h2>Student account</h2><p>All fields are required. Password must contain at least 8 characters.</p></div></div>
          <div className="form-grid">
            <label>Full name<input required value={student.full_name} onChange={(event) => setStudent({ ...student, full_name: event.target.value })} /></label>
            <label>University ID<input required value={student.university_id} onChange={(event) => setStudent({ ...student, university_id: event.target.value })} /></label>
            <label>Email<input required type="email" value={student.email} onChange={(event) => setStudent({ ...student, email: event.target.value })} /></label>
            <label>Password<input required minLength={8} type="password" value={student.password} onChange={(event) => setStudent({ ...student, password: event.target.value })} /></label>
            <label>Phone number<input required type="tel" value={student.phone} onChange={(event) => setStudent({ ...student, phone: event.target.value })} placeholder="+971 50 123 4567" /></label>
            <label>UAE city<select required value={student.city} onChange={(event) => setStudent({ ...student, city: event.target.value })}><option value="">Select city</option>{UAE_CITIES.map((city) => <option key={city}>{city}</option>)}</select></label>
            <label>Building<select required value={student.building_id} onChange={(event) => setStudent({ ...student, building_id: event.target.value })}>{buildings.map((building) => <option key={building.id} value={building.id}>{building.name} ({building.code})</option>)}</select></label>
            <label>
  Room number
  <input
    required
    value={student.room_number}
    onChange={(event) =>
      setStudent({
        ...student,
        room_number: event.target.value,
      })
    }
    style={
      roomError
        ? {
            borderColor: "#dc2626",
            backgroundColor: "#fef2f2",
          }
        : undefined
    }
  />

  {roomError && (
    <small style={{ color: "#dc2626" }}>
      {roomError}
    </small>
  )}
</label>
            <label>
              Residence status
               <select
               required
               value={student.current_status}
               onChange={(event) =>
               setStudent({
               ...student,
              current_status: event.target.value,
              })
              }
              >
             <option value="inside">Inside</option>
             <option value="outside">Outside</option>
            </select>
            </label>
          </div>
          <FaceCapture label="Student face enrollment" onCapture={(face_image) => setStudent({ ...student, face_image })} />
          <label className="checkbox-field"><input type="checkbox" checked={student.is_active} onChange={(event) => setStudent({ ...student, is_active: event.target.checked })} /> Active student account</label>
          <button className="primary-button" disabled={saving}>{saving ? "Creating…" : "Create student"}</button>
        </form>
      ) : (
       
      <>
  <div className="user-tabs">
    <button
      type="button"
      className={
        guardianMode === "new"
          ? "active"
          : ""
      }
      onClick={() => {
        setGuardianMode("new");
        resetMessages();
      }}
    >
      Register new guardian
    </button>

    <button
      type="button"
      className={
        guardianMode === "existing"
          ? "active"
          : ""
      }
      onClick={() => {
        setGuardianMode("existing");
        resetMessages();
      }}
    >
      Link existing guardian
    </button>
  </div>

  {guardianMode === "new" ? (
    <form
      className="user-form-card"
      onSubmit={submitGuardian}
    >
      <div className="form-section-heading">
        <ShieldCheck />

        <div>
          <h2>Guardian account</h2>
          <p>
            Create a new guardian account and
            capture their face enrollment.
          </p>
        </div>
      </div>

      <div className="form-grid">
        <label>
          Related student university ID
          <input
            required
            value={
              guardian.student_university_id
            }
            onChange={(event) =>
              setGuardian({
                ...guardian,
                student_university_id:
                  event.target.value,
              })
            }
            placeholder="Example: U20260001"
          />
        </label>

        <label>
          Full name
          <input
            required
            value={guardian.full_name}
            onChange={(event) =>
              setGuardian({
                ...guardian,
                full_name: event.target.value,
              })
            }
          />
        </label>

        <label>
          Emirates ID
          <input
            required
            value={guardian.emirates_id}
            onChange={(event) =>
              setGuardian({
                ...guardian,
                emirates_id:
                  event.target.value,
              })
            }
          />
        </label>

        <label>
          Email
          <input
            required
            type="email"
            value={guardian.email}
            onChange={(event) =>
              setGuardian({
                ...guardian,
                email: event.target.value,
              })
            }
          />
        </label>

        <label>
          Password
          <input
            required
            minLength={8}
            type="password"
            value={guardian.password}
            onChange={(event) =>
              setGuardian({
                ...guardian,
                password: event.target.value,
              })
            }
          />
        </label>

        <label>
          Phone
          <input
            required
            type="tel"
            value={guardian.phone}
            onChange={(event) =>
              setGuardian({
                ...guardian,
                phone: event.target.value,
              })
            }
          />
        </label>

        <label>
          UAE city
          <select
            required
            value={guardian.city}
            onChange={(event) =>
              setGuardian({
                ...guardian,
                city: event.target.value,
              })
            }
          >
            <option value="">
              Select city
            </option>

            {UAE_CITIES.map((city) => (
              <option key={city}>
                {city}
              </option>
            ))}
          </select>
        </label>

        <label>
          Relationship to student
          <input
            required
            value={guardian.relationship}
            onChange={(event) =>
              setGuardian({
                ...guardian,
                relationship:
                  event.target.value,
              })
            }
            placeholder="Mother, father, driver…"
          />
        </label>
      </div>

      <FaceCapture
        key={guardianFaceKey}
        label="Guardian face enrollment"
        onCapture={(face_image) =>
          setGuardian({
            ...guardian,
            face_image,
          })
        }
      />

      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={guardian.is_active}
          onChange={(event) =>
            setGuardian({
              ...guardian,
              is_active:
                event.target.checked,
            })
          }
        />
        Active guardian account
      </label>

      <button
        className="primary-button"
        disabled={saving}
      >
        {saving
          ? "Creating…"
          : "Create guardian"}
      </button>
    </form>
  ) : (
    <form
      className="user-form-card"
      onSubmit={
        submitExistingGuardianLink
      }
    >
      <div className="form-section-heading">
        <ShieldCheck />

        <div>
          <h2>Link existing guardian</h2>
          <p>
            Connect an existing guardian account
            to another student without creating
            a new account or face enrollment.
          </p>
        </div>
      </div>

      <div className="form-grid">
        <label>
          Guardian email or Emirates ID
          <input
            required
            value={
              existingGuardianLink
                .guardian_identifier
            }
            onChange={(event) =>
              setExistingGuardianLink({
                ...existingGuardianLink,
                guardian_identifier:
                  event.target.value,
              })
            }
          />
        </label>

        <label>
          Student university ID
          <input
            required
            value={
              existingGuardianLink
                .student_university_id
            }
            onChange={(event) =>
              setExistingGuardianLink({
                ...existingGuardianLink,
                student_university_id:
                  event.target.value,
              })
            }
            placeholder="Example: U20260001"
          />
        </label>

        <label>
          Relationship to student
          <input
            required
            value={
              existingGuardianLink.relationship
            }
            onChange={(event) =>
              setExistingGuardianLink({
                ...existingGuardianLink,
                relationship:
                  event.target.value,
              })
            }
            placeholder="Mother, father, driver…"
          />
        </label>
      </div>

      <button
        className="primary-button"
        disabled={saving}
      >
        {saving
          ? "Linking…"
          : "Link guardian"}
      </button>
    </form>
     )}
    </>
  )}
    </section>
  );
}


function FaceCapture({ label, onCapture }: { label: string; onCapture: (image: string | null) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [running, setRunning] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (running && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => undefined);
    }
    return () => {
      if (!running) return;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [running]);

  async function startCamera() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      setRunning(true);
    } catch {
      setError("Camera permission was denied or this device has no camera.");
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    onCapture(canvas.toDataURL("image/jpeg", 0.82));
    setCaptured(true);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setRunning(false);
  }

  function clearCapture() {
    onCapture(null);
    setCaptured(false);
  }

  return (
    <div className="face-capture-card">
      <div className="face-capture-heading"><Camera size={21} /><div><strong>{label}</strong><span>Capture one clear face image with consent. This is stored as enrollment data.</span></div></div>
      {running && <video ref={videoRef} autoPlay muted playsInline className="face-video" />}
      <div className="face-capture-actions">
        {!running && !captured && <button type="button" className="secondary-button" onClick={startCamera}><Camera size={17} /> Open camera</button>}
        {running && <button type="button" className="primary-button" onClick={capture}>Capture face</button>}
        {captured && <><span className="face-captured">Face captured</span><button type="button" className="secondary-button" onClick={clearCapture}>Capture again</button></>}
      </div>
      {error && <p className="face-capture-error">{error}</p>}
    </div>
  );
}


function Overview({ buildingId }: { buildingId: number }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [recordDate, setRecordDate] = useState("");
  const [city, setCity] = useState("");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api<DashboardData>(`/buildings/${buildingId}/dashboard?record_date=${recordDate}&city=${encodeURIComponent(city)}&search=${encodeURIComponent(search)}`).then(setData);
  }, [buildingId, recordDate, city, search]);

  if (!data) return <Loading />;
  const complete = data.registered_students - data.tamam_pending;
  const percent = data.registered_students
    ? Math.round((complete / data.registered_students) * 100)
    : 0;

  return (
    <>
      <PageTitle
        title={`${data.building.name} Dashboard`}
        subtitle="Overview of today's student activity and building status."
      />
      <section className="stats-grid">
        <StatCard label="Registered students" value={data.registered_students} icon={<Users />} />
        <StatCard label="Currently inside" value={data.currently_inside} tone="green" icon={<UserCheck />} />
        <StatCard label="Currently outside" value={data.currently_outside} tone="orange" icon={<LogOut />} />
        <StatCard label="Tamam pending" value={data.tamam_pending} tone="red" icon={<ClipboardCheck />} />
      </section>
      <section className="overview-grid">
        <article className="panel status-panel">
          <h2>Today's status</h2>
          <div className="donut-row">
            <div
              className="donut"
              style={{
                background: `conic-gradient(#12a561 0 ${percent}%, #ff9f36 ${percent}% 100%)`,
              }}
            >
              <div><strong>{data.registered_students}</strong><span>Total students</span></div>
            </div>
            <div className="legend">
              <p><i className="green-dot" /> Inside <strong>{data.currently_inside}</strong></p>
              <p><i className="orange-dot" /> Outside <strong>{data.currently_outside}</strong></p>
              <p><i className="red-dot" /> Tamam pending <strong>{data.tamam_pending}</strong></p>
            </div>
          </div>
        </article>
        <article className="panel">
          <h2>Today's alerts</h2>
          <div className="alert warning"><ClipboardCheck /> {data.tamam_pending} students have not completed Daily Tamam</div>
          <div className="alert danger"><ShieldCheck /> {data.pending_guardian_approvals} guardian relationships need review</div>
          <div className="alert info"><Bus /> Review scheduled bus departure readiness</div>
        </article>
      </section>
    <section className="panel">
        <div className="panel-heading">
          <h2>Recent activity</h2>

          
        </div>

        <ReportFilters
          search={search}
          onSearch={setSearch}
          filter="all"
          onFilter={() => undefined}
          date={recordDate}
          onDateChange={setRecordDate}
          city={city}
          onCityChange={setCity}
          options={[]}
          searchPlaceholder="Search student name or ID"
        />

        <StudentTable
          rows={data.recent_activity
            .filter(
              (row, index, rows) =>
                index ===
                rows.findIndex(
                  (item) =>
                    item.university_id ===
                    row.university_id,
                ),
            )
            .filter(
              (row) =>
                !city || row.city === city,
            )}
          extraHeaders={[
            "Status",
            "Activity",
            "Time",
          ]}
          extraCells={(row) => [
            <StatusBadge
              value={row.current_status}
            />,
            row.action.replace("_", " "),
            formatTime(row.occurred_at),
          ]}
        />
      </section>
    </>
  );
}


function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <span className="date-chip">{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "numeric", year: "numeric" })}</span>
    </div>
  );
}


function SearchBox({
  value,
  onChange,
  placeholder = "Search student name or ID",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search-box">
      <Search size={19} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function ReportFilters({
  search,
  onSearch,
  filter,
  onFilter,
  options,
  date,
  onDateChange,
  city,
  onCityChange,
  showCity = true,
  searchPlaceholder = "Search student name or ID",
}: {
  search: string;
  onSearch: (value: string) => void;
  filter: string;
  onFilter: (value: string) => void;
  options: string[][];
  date: string;
  onDateChange: (value: string) => void;
  city: string;
  onCityChange: (value: string) => void;
  showCity?: boolean;
  searchPlaceholder?: string;
}) {
  return (
    <div className="report-filters">
      <SearchBox
        value={search}
        onChange={onSearch}
        placeholder={searchPlaceholder}
      />

      <label className="filter-field">
        <CalendarDays />
        <span>
          <small>Date</small>
          <input
            type="date"
            value={date}
            onChange={(event) =>
              onDateChange(event.target.value)
            }
          />
        </span>
      </label>

      <div className="filter-field">
        <Clock3 />
        <span>
          <small>Time</small>
          All times
        </span>
        <ChevronRight />
      </div>

      {showCity && (
        <label className="filter-field city-field">
          <MapPin />
          <span>
            <small>City</small>
            <select
              value={city}
              onChange={(event) =>
                onCityChange(event.target.value)
              }
            >
              <option value="">All UAE cities</option>

              {UAE_CITIES.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </span>
        </label>
      )}

      <FilterButtons
        value={filter}
        onChange={onFilter}
        options={options}
      />
    </div>
  );
}

function StudentTable({
  rows,
  extraHeaders,
  extraCells,
  showCity = true,
  whatsappReminders = false,
}: {
  rows: any[];
  extraHeaders: string[];
  extraCells: (row: any) => ReactNode[];
  showCity?: boolean;
  whatsappReminders?: boolean;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Student</th>
            <th>University ID</th>
            <th>Email</th>
            <th>Building</th>
            <th>Room</th>
            <th>Contact</th>

            {showCity && <th>City</th>}

            <th>Date</th>

            {extraHeaders.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, index) => (
            <tr
              key={
                row.record_id ??
                row.passenger_id ??
                row.id ??
                index
              }
            >
              <td>
                <strong>{row.full_name}</strong>
              </td>

              <td>{row.university_id}</td>
              <td>{row.email}</td>
              <td>B{row.building_id}</td>
              <td>{row.room_number}</td>

              <td>
                <PhoneLink
                  phone={row.phone}
                  studentName={row.full_name}
                  whatsappReminder={
                    whatsappReminders &&
                    row.tamam_status === "not_completed"
                  }
                />
              </td>

              {showCity && <td>{row.city}</td>}

              <td>{formatRecordDate(row)}</td>

              {extraCells(row).map(
                (cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {!rows.length && (
        <div className="empty-state">
          No matching records.
        </div>
      )}
    </div>
  );
}


function FilterButtons({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <div className="filter-buttons">
      {options.map(([key, label]) => (
        <button
          key={key}
          className={value === key ? "active" : ""}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}


function Tamam({ buildingId }: { buildingId: number }) {
  const [data, setData] = useState<TamamData | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [recordDate, setRecordDate] = useState("");
  const [city, setCity] = useState("");
    useEffect(() => {
  const navigation =
    performance.getEntriesByType(
      "navigation",
    )[0] as
      | PerformanceNavigationTiming
      | undefined;

  if (navigation?.type !== "reload") {
    return;
  }

  void api(
    `/buildings/${buildingId}/tamam-demo-reset`,
    {
      method: "POST",
    },
  );
}, [buildingId]);
useEffect(() => {
  const navigation =
    performance.getEntriesByType(
      "navigation",
    )[0] as
      | PerformanceNavigationTiming
      | undefined;

  if (
    navigation?.type !== "reload" ||
    tamamResetHandled
  ) {
    return;
  }

  tamamResetHandled = true;

  void api(
    `/buildings/${buildingId}/tamam-demo-reset`,
    {
      method: "POST",
    },
  );
}, [buildingId]);
  useEffect(() => {
    const loadTamam = () => {
      api<TamamData>(
        `/buildings/${buildingId}/tamam?status=${filter}&search=${encodeURIComponent(search)}&record_date=${recordDate}&city=${encodeURIComponent(city)}`,
      ).then(setData);
    };

    const timer = window.setTimeout(
      loadTamam,
      200,
    );

    const interval = window.setInterval(
      loadTamam,
      1000,
    );

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [buildingId, filter, search, recordDate, city]);

  if (!data) return <Loading />;
  return (
    <>
      <PageTitle title={`Daily Tamam — Building ${buildingId}`} subtitle="Monitor today's attendance and identity-verification status." />
      <section className="stats-grid">
        <StatCard label="Total students" value={data.summary.total} icon={<Users />} />
        <StatCard label="Tamam completed" value={data.summary.completed} tone="green" icon={<CheckCircle2 />} />
        <StatCard label="Not completed" value={data.summary.not_completed} tone="red" icon={<ClipboardCheck />} />
        <StatCard label="Outside with permit" value={data.summary.outside_with_permit} icon={<UserCheck />} />
      </section>
      <section className="panel progress-panel">
        <h2>Today's completion</h2>
        <strong>{data.summary.completion_percent}%</strong>
        <div className="progress"><span style={{ width: `${data.summary.completion_percent}%` }} /></div>
      </section>
      <section className="panel">
        <h2>Student Tamam status</h2>
        <ReportFilters search={search} onSearch={setSearch} filter={filter} onFilter={setFilter} date={recordDate} onDateChange={setRecordDate} city={city} onCityChange={setCity} showCity={false} options={[
            ["all", "All students"], ["completed", "Completed"], ["not_completed", "Not completed"],
          ]} />
        <StudentTable
          rows={data.items}
          showCity={false}
          whatsappReminders
          extraHeaders={["Tamam status", "Method", "Completion time"]}
          extraCells={(row) => [
            <StatusBadge value={row.tamam_status} />,
            row.verification_method?.replace("_", " ") ?? "—",
            row.completed_at ? formatTime(row.completed_at) : "—",
          ]}
        />
      </section>
    </>
  );
}
let busResetHandled = false;
function Buses({ buildingId }: { buildingId: number }) {
  const [trips, setTrips] = useState<BusTrip[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [passengers, setPassengers] = useState<BusPassenger[]>([]);
  const [search, setSearch] = useState("");
  const [recordDate, setRecordDate] = useState("");
  const [city, setCity] = useState("");
  const [filter, setFilter] = useState("all");
  const selectedTrip = trips.find((trip) => trip.id === selected);
   useEffect(() => {
  const navigation =
    performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;

  if (
    navigation?.type !== "reload" ||
    busResetHandled
  ) {
    return;
  }

  busResetHandled = true;

  void api(`/buildings/${buildingId}/bus-demo-reset`, {
    method: "POST",
  });
}, [buildingId]);
  useEffect(() => {
     const loadTrips = () => {
    api<BusTrip[]>(
      `/buildings/${buildingId}/bus-trips?record_date=${recordDate}`,
    ).then((records) => {
      setTrips(records);

      setSelected((current) =>
        records.some((trip) => trip.id === current)
          ? current
          : records[0]?.id ?? null,
      );
    });
  };

  loadTrips();

  const timer = window.setInterval(loadTrips, 1000);

  return () => window.clearInterval(timer);
}, [buildingId, recordDate]);

 useEffect(() => {
  if (!selected) return;

  const loadPassengers = () => {
    api<BusPassenger[]>(
      `/bus-trips/${selected}/passengers?city=${encodeURIComponent(city)}&search=${encodeURIComponent(search)}`,
    ).then((records) =>
      setPassengers(
        filter === "all"
          ? records
          : records.filter((row) => row.boarding_status === filter),
      ),
    );
  };

  loadPassengers();

  const timer = window.setInterval(loadPassengers, 1000);

  return () => window.clearInterval(timer);
}, [selected, recordDate, city, search, filter]);

  const expected = trips.reduce((total, trip) => total + trip.expected, 0);
  const boarded = trips.reduce((total, trip) => total + trip.boarded, 0);
  return (
    <>
      <PageTitle title={`Bus Trips — Building ${buildingId}`} subtitle="Track student boarding and bus departure readiness." />
      <section className="stats-grid">
        <StatCard label="Scheduled trips" value={trips.length} icon={<Bus />} />
        <StatCard label="Students expected" value={expected} tone="green" icon={<Users />} />
        <StatCard label="Students boarded" value={boarded} icon={<UserCheck />} />
        <StatCard label="Pending boarding" value={expected - boarded} tone="orange" icon={<ClipboardCheck />} />
      </section>
      <section className="trip-grid">
        {trips.map((trip) => {
          const percent = trip.expected ? Math.round(trip.boarded * 100 / trip.expected) : 0;
          return (
            <button
              className={`trip-card ${selected === trip.id ? "selected" : ""}`}
              key={trip.id}
              onClick={() => setSelected(trip.id)}
            >
              <Bus />
              <div>
                <strong>{trip.destination} — {trip.bus_number}</strong>
               
                <div className="mini-progress"><i style={{ width: `${percent}%` }} /></div>
              </div>
              <div className="bus-count">
          <b>{trip.boarded}/{trip.expected}</b>
           {trip.boarded === trip.expected && (
             <span>Ready to Depart</span>
           )}
          </div>
            </button>
          );
        })}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Passenger list</h2>
          <strong>{passengers.filter((passenger) => passenger.boarding_status === "boarded").length}/{passengers.length} boarded</strong>
        </div>
        <ReportFilters search={search} onSearch={setSearch} filter={filter} onFilter={setFilter} date={recordDate} onDateChange={setRecordDate} city={city} onCityChange={setCity} searchPlaceholder="Search by student name, university ID or email" options={[["all", "All passengers"], ["boarded", "Boarded"], ["not_boarded", "Not boarded"]]} />
        <StudentTable
          rows={passengers.map((passenger) => ({ ...passenger,
          city: selectedTrip?.destination ?? passenger.city,
           }))}
          extraHeaders={["Verification", "Boarding status", "Time"]}
          extraCells={(row) => [
            row.verification_method === "card_verification" ? "Card verification" : "—",
            <StatusBadge value={row.boarding_status} />,
            row.boarded_at ? formatTime(row.boarded_at) : "—",
          ]}
        />
      </section>
    </>
  );
}


function GuardianApprovals({ buildingId }: { buildingId: number }) {
  const [links, setLinks] = useState<GuardianLink[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [editGuardian, setEditGuardian] = useState({ full_name: "", phone: "", city: "", relationship: "", is_active: true });
  const [
  showGuardianFaceCapture,
  setShowGuardianFaceCapture,
] = useState(false);

const [
  guardianFaceImage,
  setGuardianFaceImage,
] = useState<string | null>(null);

const [
  faceUpdateMessage,
  setFaceUpdateMessage,
] = useState("");
  function load() {
    api<GuardianLink[]>(
      `/buildings/${buildingId}/guardian-links?status=${filter}&search=${encodeURIComponent(search)}`,
    ).then((records) => {
      setLinks(records);
      setSelectedId((current) =>
        records.some((record) => record.id === current)
          ? current
          : records[0]?.id ?? null,
      );
    });
  }

  useEffect(() => {
    const timer = window.setTimeout(load, 200);
    return () => window.clearTimeout(timer);
  }, [buildingId, filter, search]);

  const selected = links.find((link) => link.id === selectedId) ?? null;

  useEffect(() => {
    if (selected) {
      setEditGuardian({ full_name: selected.guardian.full_name, phone: selected.guardian.phone, city: selected.guardian.city, relationship: selected.relationship, is_active: true });
      setEditing(false);
    }
  }, [selectedId]);

  async function saveGuardian() {
    if (!selected) return;
    await api(`/admin/guardians/${selected.guardian.id}`, { method: "PATCH", body: JSON.stringify(editGuardian) });
    setEditing(false);
    load();
  }
  async function saveGuardianFace() {
  if (!selected || !guardianFaceImage) return;

  setFaceUpdateMessage("");

  try {
    await api(
      `/admin/guardians/${selected.guardian.id}/face`,
      {
        method: "PATCH",
        body: JSON.stringify({
          face_image: guardianFaceImage,
        }),
      },
    );

    setFaceUpdateMessage(
      "Guardian face updated successfully.",
    );

    setGuardianFaceImage(null);
    setShowGuardianFaceCapture(false);
    load();
  } catch (reason) {
    setFaceUpdateMessage(
      reason instanceof Error
        ? reason.message
        : "Unable to update guardian face.",
    );
  }
}
  
  async function deleteSelectedGuardian() {
    if (!selected) return;
    if (!window.confirm(`Delete ${selected.guardian.full_name} permanently?`)) return;
    await api(`/admin/guardians/${selected.guardian.id}`, { method: "DELETE" });
    setSelectedId(null);
    load();
  }

  async function review(decision: "approved" | "rejected") {
    if (!selected) return;
    await api(`/guardian-links/${selected.id}/review`, {
      method: "PATCH",
      body: JSON.stringify({ decision, note }),
    });
    setNote("");
    load();
  }

  return (
    <>
      <PageTitle title={`Guardian Relationship Approvals — Building ${buildingId}`} subtitle="Verify guardian identity and relationships before allowing student access." />
      <section className="relationship-stats">
        <StatCard label="Displayed requests" value={links.length} tone="orange" icon={<Users />} />
        <StatCard label="Face verified" value={links.filter((link) => link.guardian.face_status === "verified").length} tone="green" icon={<CheckCircle2 />} />
        <StatCard label="Needs review" value={links.filter((link) => link.guardian.face_status !== "verified").length} tone="red" icon={<ShieldCheck />} />
      </section>
      <section className="relationship-layout">
        <article className="panel request-list">
          <h2>Guardian requests</h2>
          <SearchBox value={search} onChange={setSearch} placeholder="Search guardian or student" />
          <FilterButtons value={filter} onChange={setFilter} options={[
            ["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["all", "All"],
          ]} />
          <div className="request-items">
            {links.map((link) => (
              <button
                key={link.id}
                className={selectedId === link.id ? "selected" : ""}
                onClick={() => setSelectedId(link.id)}
              >
                <div className="avatar">{link.guardian.full_name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div>
                <div>
                  <strong>{link.guardian.full_name}</strong>
                  <span>{link.relationship} of {link.student.full_name}</span>
                </div>
                <StatusBadge value={link.guardian.face_status} />
                <ChevronRight size={18} />
              </button>
            ))}
            {!links.length && <div className="empty-state">No matching requests.</div>}
          </div>
        </article>
        <article className="panel review-panel">
          {!selected ? (
            <div className="empty-state">Select a relationship request.</div>
          ) : (
            <>
              <div className="panel-heading">
                <h2>Review relationship request</h2>
                <StatusBadge value={selected.status} />
              </div>
              <div className="identity-grid">
                <div className="large-avatar">{selected.guardian.full_name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div>
                <dl>
                  <dt>Guardian name</dt><dd>{selected.guardian.full_name}</dd>
                  <dt>Emirates ID</dt><dd>{selected.guardian.emirates_id}</dd>
                  <dt>Mobile number</dt><dd><PhoneLink phone={selected.guardian.phone} /></dd>
                  <dt>Email</dt><dd>{selected.guardian.email}</dd>
                  <dt>UAE city</dt><dd>{selected.guardian.city}</dd>
                  <dt>Face verification</dt><dd><StatusBadge value={selected.guardian.face_status} /></dd>
                  <dt>Identity match</dt><dd><strong>{selected.guardian.identity_match}%</strong></dd>
                </dl>
              </div>
              <div className="guardian-detail-actions">
                {!editing ? <button className="secondary-button" onClick={() => setEditing(true)}>Edit guardian details</button> : (
                  <div className="guardian-edit-grid">
                    <label>Full name<input value={editGuardian.full_name} onChange={(event) => setEditGuardian({ ...editGuardian, full_name: event.target.value })} /></label>
                    <label>Phone<input value={editGuardian.phone} onChange={(event) => setEditGuardian({ ...editGuardian, phone: event.target.value })} /></label>
                    <label>City<input value={editGuardian.city} onChange={(event) => setEditGuardian({ ...editGuardian, city: event.target.value })} /></label>
                    <label>Relationship<input value={editGuardian.relationship} onChange={(event) => setEditGuardian({ ...editGuardian, relationship: event.target.value })} /></label>
                    <div><button className="primary-button" onClick={saveGuardian}>Save changes</button> <button className="secondary-button" onClick={() => setEditing(false)}>Cancel</button></div>
                  </div>
                )}
                <button
  className="secondary-button"
  type="button"
  onClick={() => {
    setShowGuardianFaceCapture(
      !showGuardianFaceCapture,
    );
    setGuardianFaceImage(null);
    setFaceUpdateMessage("");
  }}
>
  Retake guardian face
</button>

{showGuardianFaceCapture && (
  <div className="guardian-face-update">
    <FaceCapture
      label="Capture the guardian's new face"
      onCapture={setGuardianFaceImage}
    />

    <button
      className="primary-button"
      type="button"
      disabled={!guardianFaceImage}
      onClick={saveGuardianFace}
    >
      Save new face
    </button>
  </div>
)}

{faceUpdateMessage && (
  <div className="success-message">
    {faceUpdateMessage}
  </div>
)}

<button
  className="danger-button"
  type="button"
  onClick={deleteSelectedGuardian}
>
  <Trash2 size={17} />
  Delete guardian
</button>
              </div>
              <hr />
              <h3>Requested student relationship</h3>
              <dl className="student-details">
                <dt>Student name</dt><dd>{selected.student.full_name}</dd>
                <dt>University ID</dt><dd>{selected.student.university_id}</dd>
                <dt>Building</dt><dd>B{selected.student.building_id}</dd>
                <dt>Room</dt><dd>{selected.student.room_number}</dd>
                <dt>Relationship</dt><dd>{selected.relationship}</dd>
                  <dt>Student contact</dt><dd><PhoneLink phone={selected.student.phone} /></dd>
              </dl>
              {selected.status === "pending" && (
                <>
                  <label className="note-field">
                    Supervisor note (optional)
                    <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a review note…" />
                  </label>
                  <div className="review-actions">
                    <button className="reject-button" onClick={() => review("rejected")}><X size={19} /> Reject relation</button>
                    <button className="primary-button" onClick={() => review("approved")}><Check size={19} /> Accept relation</button>
                  </div>
                </>
              )}
            </>
          )}
        </article>
      </section>
    </>
  );
}


function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRecordDate(row: any) {
  const value = row.occurred_at ?? row.completed_at ?? row.boarded_at ?? row.departure_at;
  return value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}


function App() {
  const [user, setUser] = useState<Supervisor | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api<Supervisor>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
    window.location.href = "/admin/login";
  }

  if (checking) return <Loading />;

  return (
    <>
      <Routes>
        <Route path="/" element={<PortalHome />} />
        <Route path="/student/*" element={<StudentApp />} />
        <Route path="/kiosk/student" element={<StudentKiosk />} />
        <Route path="/kiosk/guardian" element={<GuardianKiosk />} />
        <Route path="/admin/login" element={user ? <Navigate to="/admin/buildings" replace /> : <LoginPage onLogin={setUser} />} />
        <Route path="/admin/buildings" element={user ? <BuildingSelection user={user} onLogout={logout} /> : <Navigate to="/admin/login" replace />} />
        <Route path="/admin/buildings/:buildingId" element={user ? <AdminLayout user={user} onLogout={logout} /> : <Navigate to="/admin/login" replace />} />
        <Route path="/admin/buildings/:buildingId/:section" element={user ? <AdminLayout user={user} onLogout={logout} /> : <Navigate to="/admin/login" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <UserSelectionButton />
    </>
  );
}

export default App;

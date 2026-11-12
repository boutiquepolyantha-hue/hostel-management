import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Building2,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  ChevronRight,
  CircleUserRound,
  Clock3,
  DoorOpen,
  GraduationCap,
  Home,
  IdCard,
  LockKeyhole,
  LogOut,
  QrCode,
  ShieldCheck,
  UsersRound,
  UserPlus,
  UserRound,
} from "lucide-react";
import {
  FormEvent,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";

import { api } from "../api";
import { ChatAssistant } from "../ChatAssistant";
import "./student.css";


interface GuardianSummary {
  id: number;
  full_name: string;
  phone: string;
  relationship: string;
  relationship_status: string;
  face_status: string;
}

interface GuardianRequest {
  id: number;
  guardian_code: string;
  full_name: string;
  email: string;
  phone: string;
  relationship: string;
  status: string;
  face_status: string;
  face_enrolled: boolean;
  requested_at: string;
}

interface StudentProfileData {
  id: number;
  university_id: string;
  full_name: string;
  email: string;
  phone: string;
  city: string;
  building_id: number;
  room_number: string;
  current_status: string;
  active: boolean;
  face_status: string;
  face_enrolled: boolean;
  face_image: string | null;
  guardian: GuardianSummary | null;
  relationship: string | null;
  last_access: {
    action: string;
    occurred_at: string;
    face_status: string;
  } | null;
}

interface AccessRequestResult {
  id: number;
  action: "check_in" | "check_out";
  status: string;
  guardian_name: string;
  student: StudentProfileData;
  created_at?: string;
}

interface VerificationResult {
  id: number;
  action: "check_in" | "check_out";
  status: string;
  face_verified: boolean;
  qr_token: string;
  expires_at: string;
  valid_for_seconds: number;
}

function parseUtcTimestamp(value: string) {
  // Earlier API responses did not include an offset. Treat those values as
  // UTC too, so an already-open student screen does not expire the QR based
  // on the browser's local timezone.
  return new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`);
}

function PhoneLink({ phone }: { phone?: string | null }) {
  if (!phone) return <span>—</span>;
  return <a className="phone-link" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>{phone}</a>;
}

function StudentLoading() {
  return (
    <main className="student-mobile-shell student-center">
      <div className="spinner" />
      <p>Checking your session…</p>
    </main>
  );
}


function StudentLogin({
  onLogin,
}: {
  onLogin: (student: StudentProfileData) => void;
}) {
  const [identifier, setIdentifier] = useState("U20260001");
  const [password, setPassword] = useState("Student123!");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await api<{
        authenticated: boolean;
        student: StudentProfileData;
      }>("/student/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      });
      onLogin(result.student);
      navigate("/student/home");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="student-login-page">
      <button className="student-back-link" onClick={() => navigate("/")}>
        <ArrowLeft size={20} /> Portals
      </button>
      <form className="student-login-card" onSubmit={submit}>
        <p className="student-eyebrow">Residence Management</p>
        <h1>Student Login</h1>
        <p>Sign in to access your residence services.</p>
        <div className="student-building-drawing">
          <Building2 size={130} strokeWidth={1.15} />
        </div>
        <label>
          Student ID or university email
          <span className="student-input">
            <UserRound size={20} />
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="Enter student ID or email"
              autoComplete="username"
              required
            />
          </span>
        </label>
        <label>
          Password
          <span className="student-input">
            <LockKeyhole size={20} />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              required
            />
          </span>
        </label>
        {error && <div className="student-error">{error}</div>}
        <button className="student-primary" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
        <small><LockKeyhole size={15} /> Secure access for authorized students only</small>
      </form>
    </main>
  );
}


function StudentNavigation({ active }: { active: string }) {
  const navigate = useNavigate();
  return (
    <nav className="student-bottom-nav">
      <button className={active === "home" ? "active" : ""} onClick={() => navigate("/student/home")}>
        <Home /> <span>Home</span>
      </button>
      <button className={active === "access" ? "active" : ""} onClick={() => navigate("/student/access")}>
        <DoorOpen /> <span>Dorm Access</span>
      </button>
      <button className={active === "id" ? "active" : ""} onClick={() => navigate("/student/id")}>
        <IdCard /> <span>Digital Student ID</span>
      </button>
      <button
  className={
    active === "tamam" ? "active" : ""
  }
  onClick={() =>
    navigate("/student/tamam")
  }
>
  <ClipboardCheck />
  <span>Tamam</span>
    </button>
      <button className={active === "guardians" ? "active" : ""} onClick={() => navigate("/student/guardians")}>
        <UsersRound /> <span>Guardian</span>
      </button>
      <button className={active === "profile" ? "active" : ""} onClick={() => navigate("/student/profile")}>
        <CircleUserRound /> <span>Profile</span>
      </button>
    </nav>
  );
}


function ResidenceStatus({ student }: { student: StudentProfileData }) {
  const inside = student.current_status === "inside";
  return (
    <section className={`residence-status ${inside ? "inside" : "outside"}`}>
      <div className="residence-status-icon">
        {inside ? <Home /> : <LogOut />}
        <CheckCircle2 />
      </div>
      <div>
        <span>Residence status</span>
        <h2>{inside ? "Inside the Residence" : "Outside the Residence"}</h2>
        <p>
          {student.last_access
            ? `Last activity: ${new Date(student.last_access.occurred_at).toLocaleString()}`
            : "No recent access record"}
        </p>
      </div>
    </section>
  );
}


function StudentPage({
  student,
  active,
  children,
}: {
  student: StudentProfileData;
  active: string;
  children: ReactNode;
}) {
  return (
    <main className="student-app-background">
      <div className="student-mobile-shell">
        <aside className="student-sidebar">
          <div className="student-brand"><GraduationCap /> <strong>Student Portal</strong></div>
          <StudentNavigation active={active} />
        </aside>
        <section className="student-workspace">
          <header className="student-topbar"><Bell /><div className="student-avatar">{initials(student.full_name)}</div><strong>{student.full_name}</strong><ChevronRight /></header>
          {children}
        </section>
      </div>
    </main>
  );
}


function StudentHomePage({ student }: { student: StudentProfileData }) {
  const navigate = useNavigate();
  const firstName = student.full_name.split(" ")[0];
  return (
    <StudentPage student={student} active="home">
      <div className="student-screen-content">
        <header className="student-welcome"><div><h1>Good morning, {firstName}</h1><p>Building {student.building_id} • Room {student.room_number}</p></div></header>
        <div className="student-home-layout"><div><ResidenceStatus student={student} /><h2 className="student-section-title">Services</h2><section className="student-service-grid"><button className="student-service-card" onClick={() => navigate("/student/id")}>
          <span className="student-service-icon"><IdCard /></span>
          <span><strong>Digital Student ID</strong><small>Open your residence ID</small></span>
          <ChevronRight />
        </button>
        <section className="student-service-card access-service">
          <span className="student-service-icon"><DoorOpen /></span>
          <span className="student-service-main">
            <strong>Dorm Access</strong>
            <span className="student-access-actions">
              <button
                className="enter"
                disabled={student.current_status === "inside"}
                onClick={() => navigate("/student/access?mode=check_in")}
              >
                <ArrowRight /> Enter dorm
              </button>
              <button
                className="leave"
                disabled={student.current_status === "outside"}
                onClick={() => navigate("/student/access?mode=check_out")}
              >
                <LogOut /> Leave dorm
              </button>
            </span>
            <small>Generate QR and verify your face</small>
          </span>
        </section>
        <button className="student-service-card" onClick={() => navigate("/student/guardians")}>
          <span className="student-service-icon"><ShieldCheck /></span>
          <span>
            <strong>Guardian</strong>
            <small>
              {student.guardian
                ? `${student.guardian.full_name} • Relationship approved`
                : "Guardian approval required"}
            </small>
          </span>
          <ChevronRight />
        </button></section></div>
          <section className="student-white-card residence-details"><h2>Residence details</h2><ProfileSection title="" rows={[["Building", `Building ${student.building_id}`], ["Room", `Room ${student.room_number}`], ["Guardian", student.guardian ? student.guardian.full_name : "No approved guardian"]]} /></section>
        </div>
      </div>
    </StudentPage>
  );
}


function DormAccessPage({
  student,
}: {
  student: StudentProfileData;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState<AccessRequestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const load = () => api<{ request: AccessRequestResult | null }>("/student/access/pending")
      .then(result => { setPending(result.request); setError(""); })
      .catch(reason => setError(reason instanceof Error ? reason.message : "Could not load access request"))
      .finally(() => setLoading(false));
    load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <StudentPage student={student} active="access">
      <div className="student-screen-content">
        <header className="student-centered-header">
          <button onClick={() => navigate("/student/home")}><ArrowLeft /></button>
          <div><h1>Dorm Access</h1><p>Building {student.building_id} • Room {student.room_number}</p></div>
        </header>
        <ResidenceStatus student={student} />
        <section className="student-white-card">
          <h2>Guardian access request</h2>
          {loading ? <p>Checking for a request…</p> : pending ? (
            <>
              <div className={`access-request-banner ${pending.action === "check_out" ? "leave" : "enter"}`}>
                {pending.action === "check_out" ? <LogOut /> : <ArrowRight />}
                <div><strong>{pending.action === "check_out" ? "Check-out requested" : "Check-in requested"}</strong><p>Authorized by {pending.guardian_name}</p></div>
              </div>
              {!student.face_enrolled && <div className="student-error">Enroll your face in your Student Profile before confirming this request. <button className="student-secondary" onClick={() => navigate("/student/profile")}>Open Profile</button></div>}
              <button className="student-primary" disabled={!student.face_enrolled} onClick={() => navigate(`/student/verify/${pending.id}`)}><Camera /> Confirm face verification</button>
            </>
          ) : (
            <div className="verification-note"><Clock3 /><div><strong>Waiting for your guardian</strong><p>Your approved guardian must verify at the guardian kiosk, select you, and send a check-in or check-out request.</p></div></div>
          )}
          {error && <div className="student-error">{error}</div>}
        </section>
        <section className="verification-note">
          <Camera />
          <div><strong>QR and face verification required</strong><p>Your QR code is valid for five minutes.</p></div>
        </section>
        <section className="student-white-card guardian-card">
          <h2>Approved Guardian</h2>
          {student.guardian ? (
            <div className="guardian-summary">
              <div className="student-avatar">{initials(student.guardian.full_name)}</div>
              <div>
                <strong>{student.guardian.full_name}</strong>
                <p>{student.guardian.relationship}</p>
                <span><ShieldCheck /> Relationship approved</span>
              </div>
            </div>
          ) : (
            <div className="student-error">No approved guardian relationship.</div>
          )}
          <button className="student-secondary" onClick={() => navigate("/student/guardians")}>
            <UserPlus /> Add or manage guardians
          </button>
        </section>
      </div>
    </StudentPage>
  );
}


function FaceAndQrPage({ student }: { student: StudentProfileData }) {
  const { requestId } = useParams();
  const [cameraActive, setCameraActive] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [seconds, setSeconds] = useState(300);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!result) return;
    const expires = parseUtcTimestamp(result.expires_at).getTime();
    const update = () => {
      setSeconds(Math.max(0, Math.ceil((expires - Date.now()) / 1000)));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [result]);

  useEffect(() => {
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function startCamera() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera is unavailable here. Open the app on localhost or HTTPS, then allow camera access.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      requestAnimationFrame(async () => {
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => null); }
      });
    } catch (reason) {
      const name = reason instanceof DOMException ? reason.name : "";
      setError(name === "NotAllowedError" ? "Camera permission was blocked. Allow camera access in your browser, then try again." : "No camera was found. Use localhost or HTTPS and make sure another app is not using the camera.");
    }
  }

  async function verify() {
    if (!requestId) return;
    try {
      const video = videoRef.current;
      if (!video) throw new Error("Camera capture is not ready");
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const face_image = canvas.toDataURL("image/jpeg", .82);
      const response = await api<VerificationResult>(
        `/student/access/${requestId}/face-verify`,
        { method: "POST", body: JSON.stringify({ face_image }) },
      );
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setCameraActive(false);
      setResult(response);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Verification failed");
    }
  }

  const action = result?.action ?? (
    student.current_status === "inside" ? "check_out" : "check_in"
  );
  return (
    <StudentPage student={student} active="access">
      <div className="student-screen-content">
        <header className="student-centered-header">
          <button onClick={() => navigate("/student/access")}><ArrowLeft /></button>
          <div><h1>QR & Face Verification</h1><p>Building {student.building_id} • Room {student.room_number}</p></div>
        </header>
        <div className="verification-steps">
          <span className="done"><CheckCircle2 /> Request</span>
          <i />
          <span className={result ? "done" : "active"}><Camera /> Face</span>
          <i />
          <span className={result ? "active" : ""}><QrCode /> QR</span>
        </div>
        <section className={`access-request-banner ${action === "check_out" ? "leave" : "enter"}`}>
          {action === "check_out" ? <LogOut /> : <ArrowRight />}
          <div>
            <strong>{action === "check_out" ? "Leave Dorm" : "Enter Dorm"}</strong>
            <p>Requested for {student.full_name}</p>
            <small>Approved guardian authorization required</small>
          </div>
        </section>
        {!result ? (
          <section className="face-card">
            <h2><Camera /> Complete Face Verification</h2>
            {student.face_image && <div className="enrolled-face-reference"><img src={student.face_image} alt="Your saved face verification photo" /><div><strong>Saved verification photo</strong><small>This photo is reused for check-in and check-out verification.</small></div></div>}
            <div className="camera-frame">
              {cameraActive
                ? <video ref={videoRef} autoPlay playsInline muted />
                : <UserRound size={92} strokeWidth={1.1} />}
            </div>
            <strong>Position your face inside the frame</strong>
            <p>Remove sunglasses and look directly at the camera.</p>
            {!cameraActive ? (
              <button className="student-primary" onClick={startCamera}>Start camera</button>
            ) : (
              <button className="student-primary" onClick={verify}>Capture and verify face</button>
            )}
            {error && <div className="student-error">{error}</div>}
            <small>
              This starter connects the camera and secure workflow. Replace the
              demonstration verification endpoint with the Raspberry Pi face
              matching service before production.
            </small>
          </section>
        ) : (
          <section className="qr-card">
            <h2><QrCode /> Scan Access QR</h2>
            {seconds > 0 ? (
              <>
                <div className="qr-frame">
                  <QRCodeSVG value={result.qr_token} size={236} level="H" />
                </div>
                <span>Expires in</span>
                <strong className="qr-timer">{formatCountdown(seconds)}</strong>
                <div className="qr-progress"><i style={{ width: `${seconds / 3}%` }} /></div>
                <p>Scan this code at the residence {action === "check_out" ? "exit" : "entrance"}.</p>
                <small>Valid for five minutes and one scan only.</small>
              </>
            ) : (
              <div className="student-error">
                <p>This QR code has expired. Confirm your face again to generate a new QR for this existing guardian request.</p>
                <button className="student-secondary" onClick={verify}>Generate new QR</button>
              </div>
            )}
          </section>
        )}
      </div>
    </StudentPage>
  );
}


function StudentIdPage({ student }: { student: StudentProfileData }) {
  const navigate = useNavigate();
  return (
    <StudentPage student={student} active="id">
      <div className="student-screen-content">
        <header className="student-centered-header">
          <button onClick={() => navigate("/student/home")}><ArrowLeft /></button>
          <div><h1>University Student ID</h1></div>
        </header>
        <section className="digital-id">
          <div className="id-photo">{student.face_image ? <img src={student.face_image} alt="Student face verification photo" /> : <UserRound size={100} strokeWidth={1.15} />}</div>
          <h2>{student.full_name}</h2>
          <dl>
            <dt>University ID</dt><dd>{student.university_id}</dd>
            <dt>University email</dt><dd>{student.email}</dd>
            <dt>Building</dt><dd>Building {student.building_id}</dd>
            <dt>Room</dt><dd>{student.room_number}</dd>
          </dl>
          <span><CheckCircle2 /> Active Student</span>
          <div className="barcode" aria-hidden="true" />
          <strong>{student.university_id} · B{student.building_id} · {student.room_number}</strong>
        </section>
      </div>
    </StudentPage>
  );
}


function StudentProfilePage({
  student,
  onLogout,
}: {
  student: StudentProfileData;
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  const [facePhoto, setFacePhoto] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [faceEnrolled, setFaceEnrolled] = useState(student.face_enrolled);
  const [faceSaving, setFaceSaving] = useState(false);
  const [faceMessage, setFaceMessage] = useState("");
  const [faceError, setFaceError] = useState("");
  const [currentPassword, setCurrentPassword] =
  useState("");
const [newPassword, setNewPassword] =
  useState("");
const [confirmPassword, setConfirmPassword] =
  useState("");
const [passwordSaving, setPasswordSaving] =
  useState(false);
const [passwordMessage, setPasswordMessage] =
  useState("");
const [passwordError, setPasswordError] =
  useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => streamRef.current?.getTracks().forEach(track => track.stop()), []);

  async function startFaceCamera() {
    setFaceError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setFaceError("Camera access requires HTTPS or localhost.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      setCameraActive(true);
      requestAnimationFrame(async () => { if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => null); } });
    } catch { setFaceError("Camera permission was blocked or no camera was found."); }
  }

  function captureStudentFace() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFacePhoto(canvas.toDataURL("image/jpeg", .82));
    streamRef.current?.getTracks().forEach(track => track.stop());
    setCameraActive(false);
  }

  async function saveStudentFace() {
    if (!facePhoto) return;
    setFaceSaving(true); setFaceError(""); setFaceMessage("");
    try {
      await api("/student/profile/face", { method: "PATCH", body: JSON.stringify({ face_image: facePhoto }) });
      setFaceEnrolled(true); setFaceMessage("Your face verification photo was saved.");
    } catch (reason) { setFaceError(reason instanceof Error ? reason.message : "Could not save face verification"); }
    finally { setFaceSaving(false); }
  }
  async function changePassword(
  event: FormEvent,
) {
  event.preventDefault();

  setPasswordError("");
  setPasswordMessage("");

  if (newPassword !== confirmPassword) {
    setPasswordError(
      "The new passwords do not match.",
    );
    return;
  }

  if (newPassword.length < 8) {
    setPasswordError(
      "The new password must contain at least 8 characters.",
    );
    return;
  }

  setPasswordSaving(true);

  try {
    const result = await api<{
      changed: boolean;
      message: string;
    }>("/student/profile/password", {
      method: "PATCH",
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });

    setPasswordMessage(result.message);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  } catch (reason) {
    setPasswordError(
      reason instanceof Error
        ? reason.message
        : "Could not change password",
    );
  } finally {
    setPasswordSaving(false);
  }
}
  return (
    <StudentPage student={student} active="profile">
      <div className="student-screen-content">
        <header className="student-profile-heading"><h1>Profile</h1></header>
        <section className="student-profile-card">
          <div className="student-avatar large">{initials(student.full_name)}</div>
          <div><h2>{student.full_name}</h2><StatusPill text="Active Student" /><p>{student.university_id}<br />{student.email}</p></div>
        </section>
        <ProfileSection title="Personal Information" rows={[
          ["Mobile number", <PhoneLink phone={student.phone} />],
          ["UAE city", student.city],
        ]} />
        <ProfileSection title="Residence Information" rows={[
          ["Building", `Building ${student.building_id}`],
          ["Room", student.room_number],
          ["Residence status", student.current_status],
        ]} />
        <section className="student-white-card">
          <h2>Guardian</h2>
          {student.guardian ? (
            <div className="profile-guardian">
              <ShieldCheck />
              <div><strong>{student.guardian.full_name}</strong><p>{student.guardian.relationship}<br /><PhoneLink phone={student.guardian.phone} /></p></div>
              <StatusPill text="Relationship approved" />
            </div>
          ) : <p>No approved guardian.</p>}
          <button className="student-secondary" onClick={() => navigate("/student/guardians")}><UserPlus /> Manage guardians</button>
        </section>
        <section className="student-white-card">
          <h2>Security & Verification</h2>
          <div className="profile-row"><Camera /> Face verification <StatusPill text={faceEnrolled ? "Enrolled" : "Not enrolled"} /></div>
          <div className="guardian-photo-capture">
            {facePhoto ? <img src={facePhoto} alt="Student face enrollment" /> : cameraActive ? <video ref={videoRef} autoPlay playsInline muted /> : <UserRound />}
            <div><strong>Student face enrollment</strong><p>Save your face once so it can be verified when a guardian requests check-in or check-out.</p>
              {!cameraActive && !facePhoto && <button type="button" className="student-secondary" onClick={startFaceCamera}><Camera /> Open camera</button>}
              {cameraActive && <button type="button" className="student-primary" onClick={captureStudentFace}>Capture face</button>}
              {facePhoto && <><button type="button" className="student-secondary" onClick={() => setFacePhoto("")}>Retake</button><button type="button" className="student-primary" disabled={faceSaving} onClick={saveStudentFace}>{faceSaving ? "Saving…" : "Save face verification"}</button></>}
              {faceError && <div className="student-error">{faceError}</div>}{faceMessage && <div className="student-success">{faceMessage}</div>}
            </div>
          </div>
          <form
  className="guardian-request-form"
  onSubmit={changePassword}
>
  <h2>Change password</h2>

  <p>
    Enter your current password before choosing
    a new permanent password.
  </p>

  <div className="guardian-form-grid">
    <label>
      Current password
      <input
        required
        type="password"
        autoComplete="current-password"
        value={currentPassword}
        onChange={(event) =>
          setCurrentPassword(
            event.target.value,
          )
        }
      />
    </label>

    <label>
      New password
      <input
        required
        type="password"
        minLength={8}
        autoComplete="new-password"
        value={newPassword}
        onChange={(event) =>
          setNewPassword(event.target.value)
        }
      />
    </label>

    <label>
      Confirm new password
      <input
        required
        type="password"
        minLength={8}
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(event) =>
          setConfirmPassword(
            event.target.value,
          )
        }
      />
    </label>
  </div>

  {passwordError && (
    <div className="student-error">
      {passwordError}
    </div>
  )}

  {passwordMessage && (
    <div className="student-success">
      {passwordMessage}
    </div>
  )}

  <button
    type="submit"
    className="student-primary"
    disabled={passwordSaving}
  >
    {passwordSaving
      ? "Saving…"
      : "Save password"}
  </button>
</form>
        </section>
        <button className="student-signout" onClick={onLogout}><LogOut /> Sign out</button>
      </div>
    </StudentPage>
  );
}


function GuardianManagementPage({ student }: { student: StudentProfileData }) {
  const navigate = useNavigate();
  const [guardians, setGuardians] = useState<GuardianRequest[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
   const [guardianMode, setGuardianMode] =
    useState<"new" | "existing">("new");

  const [
    existingGuardian,
    setExistingGuardian,
  ] = useState({
    guardian_identifier: "",
    relationship: "",
  });
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", relationship: "", emirates_id: "", city: "" });
  const [photo, setPhoto] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const load = () => api<{ guardians: GuardianRequest[] }>("/student/guardians")
    .then(result => setGuardians(result.guardians))
    .catch(reason => setError(reason instanceof Error ? reason.message : "Could not load guardians"));
  useEffect(() => { load(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      await api("/student/guardians", { method: "POST", body: JSON.stringify({ ...form, face_image: photo }) });
      setMessage("Guardian request sent. Administration will review it before access is allowed.");
      setForm({ full_name: "", email: "", phone: "", relationship: "", emirates_id: "", city: "" }); setPhoto("");
      load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not send request"); }
    finally { setSaving(false); }
  }
    async function submitExistingGuardian(
    event: FormEvent,
  ) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await api<{
        message: string;
        guardian: string;
        relationship: string;
        status: string;
      }>(
        "/student/guardians/link-existing",
        {
          method: "POST",
          body: JSON.stringify(
            existingGuardian,
          ),
        },
      );

      setMessage(
        `Your request to link ${result.guardian} ` +
          "was sent for supervisor approval.",
      );

      setExistingGuardian({
        guardian_identifier: "",
        relationship: "",
      });

      load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not send link request",
      );
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => () => streamRef.current?.getTracks().forEach(track => track.stop()), []);
  async function startCamera() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) { setError("Camera is unavailable here. Open the app on localhost or HTTPS, then allow camera access."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream; setCameraActive(true);
      requestAnimationFrame(async () => { if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => null); } });
    } catch (reason) {
      const name = reason instanceof DOMException ? reason.name : "";
      setError(name === "NotAllowedError" ? "Camera permission was blocked. Allow camera access in your browser, then try again." : "No camera was found. Use localhost or HTTPS and make sure another app is not using the camera.");
    }
  }
  function capturePhoto() { const video = videoRef.current; if (!video) return; const canvas = document.createElement("canvas"); canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480; canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height); setPhoto(canvas.toDataURL("image/jpeg", .78)); streamRef.current?.getTracks().forEach(track => track.stop()); setCameraActive(false); }

  return <StudentPage student={student} active="guardians"><div className="student-screen-content">
    <header className="student-page-heading"><h1>Guardian Management</h1><p>Add a trusted person to authorize residence access.</p></header>
    <section className="guardian-notice"><CheckCircle2 /><div><strong>Supervisor approval required</strong><p>New guardians remain pending until their details, relationship, and face enrollment are reviewed.</p></div></section>
    <div className="guardian-management-layout"><section className="student-white-card">
      <h2>Your guardians</h2>
      {guardians.length ? <div className="guardian-list">{guardians.map(guardian => <div className="profile-guardian" key={guardian.id}><ShieldCheck /><div><strong>{guardian.full_name}</strong><p>{guardian.relationship} · <PhoneLink phone={guardian.phone} /><br />Face enrollment: {guardian.face_enrolled ? "captured" : "missing"}<br />Guardian code: <strong>{guardian.status === "approved" ? guardian.guardian_code : "Assigned after approval"}</strong></p></div><StatusPill text={guardian.status === "approved" ? "Approved" : guardian.status === "rejected" ? "Rejected" : "Pending approval"} /></div>)}</div> : <p>No guardians added yet.</p>}
    </section>
   <section className="student-white-card guardian-request-form">
  <div className="guardian-form-grid">
    <button
      type="button"
      className={
        guardianMode === "new"
          ? "student-primary"
          : "student-secondary"
      }
      onClick={() => {
        setGuardianMode("new");
        setError("");
        setMessage("");
      }}
    >
      Register new guardian
    </button>

    <button
      type="button"
      className={
        guardianMode === "existing"
          ? "student-primary"
          : "student-secondary"
      }
      onClick={() => {
        setGuardianMode("existing");
        setError("");
        setMessage("");
      }}
    >
      Link existing guardian
    </button>
  </div>

  {guardianMode === "new" ? (
    <>
      <h2>
        <UserPlus /> Add new guardian
      </h2>

      <p>
        Capture the guardian’s face now; it is
        enrolled for their later face-only kiosk
        sign-in.
      </p>

      <form onSubmit={submit}>
        <div className="guardian-form-grid">
          <label>
            Full name
            <input
              required
              value={form.full_name}
              onChange={(event) =>
                setForm({
                  ...form,
                  full_name:
                    event.target.value,
                })
              }
            />
          </label>

          <label>
            Relationship
            <select
              required
              value={form.relationship}
              onChange={(event) =>
                setForm({
                  ...form,
                  relationship:
                    event.target.value,
                })
              }
            >
              <option value="">
                Select relationship
              </option>

              {[
                "Cousin",
                "Driver",
                "Housekeeper",
                "Mother",
                "Brother",
                "Sister",
                "Father",
                "Uncle",
                "Aunt",
              ].map((relationship) => (
                <option key={relationship}>
                  {relationship}
                </option>
              ))}
            </select>
          </label>

          <label>
            Mobile number
            <input
              required
              value={form.phone}
              onChange={(event) =>
                setForm({
                  ...form,
                  phone: event.target.value,
                })
              }
            />
          </label>

          <label>
            Email address
            <input
              required
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm({
                  ...form,
                  email: event.target.value,
                })
              }
            />
          </label>

          <label>
            Emirates ID
            <input
              required
              value={form.emirates_id}
              onChange={(event) =>
                setForm({
                  ...form,
                  emirates_id:
                    event.target.value,
                })
              }
            />
          </label>

          <label>
            UAE city
            <input
              required
              value={form.city}
              onChange={(event) =>
                setForm({
                  ...form,
                  city: event.target.value,
                })
              }
            />
          </label>
        </div>

        <div className="guardian-photo-capture">
          {photo ? (
            <img
              src={photo}
              alt="Guardian face enrollment"
            />
          ) : cameraActive ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
            />
          ) : (
            <Camera />
          )}

          <div>
            <strong>
              Guardian face enrollment
            </strong>

            <p>
              Take a clear front-facing photo
              for kiosk sign-in.
            </p>

            {!cameraActive && !photo && (
              <button
                type="button"
                className="student-secondary"
                onClick={startCamera}
              >
                <Camera /> Start camera
              </button>
            )}

            {cameraActive && (
              <button
                type="button"
                className="student-primary"
                onClick={capturePhoto}
              >
                Capture photo
              </button>
            )}

            {photo && (
              <button
                type="button"
                className="student-secondary"
                onClick={() => setPhoto("")}
              >
                Retake photo
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="student-error">
            {error}
          </div>
        )}

        {message && (
          <div className="student-success">
            {message}
          </div>
        )}

        <button
          className="student-primary"
          disabled={saving || !photo}
        >
          {saving
            ? "Sending…"
            : "Send for approval"}
        </button>
      </form>
    </>
  ) : (
    <>
      <h2>
        <UserPlus /> Link existing guardian
      </h2>

      <p>
        Link a guardian who already has an
        account and face enrollment. Supervisor
        approval is still required.
      </p>

      <form
        onSubmit={submitExistingGuardian}
      >
        <div className="guardian-form-grid">
          <label>
            Guardian email or Emirates ID
            <input
              required
              value={
                existingGuardian
                  .guardian_identifier
              }
              onChange={(event) =>
                setExistingGuardian({
                  ...existingGuardian,
                  guardian_identifier:
                    event.target.value,
                })
              }
            />
          </label>

          <label>
            Relationship
            <select
              required
              value={
                existingGuardian.relationship
              }
              onChange={(event) =>
                setExistingGuardian({
                  ...existingGuardian,
                  relationship:
                    event.target.value,
                })
              }
            >
              <option value="">
                Select relationship
              </option>

              {[
                "Cousin",
                "Driver",
                "Housekeeper",
                "Mother",
                "Brother",
                "Sister",
                "Father",
                "Uncle",
                "Aunt",
              ].map((relationship) => (
                <option key={relationship}>
                  {relationship}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <div className="student-error">
            {error}
          </div>
        )}

        {message && (
          <div className="student-success">
            {message}
          </div>
        )}

        <button
          className="student-primary"
          disabled={saving}
        >
          {saving
            ? "Sending…"
            : "Send link request"}
        </button>
      </form>
    </>
  )}
</section>
   </div>
  </div></StudentPage>;
}


function ProfileSection({ title, rows }: { title: string; rows: Array<[string, ReactNode]> }) {
  return (
    <section className="student-white-card profile-section">
      <h2>{title}</h2>
      {rows.map(([label, value]) => (
        <div className="profile-row" key={label}><span>{label}</span><strong>{value}</strong></div>
      ))}
    </section>
  );
}

function StudentTamamPage({
  student,
}: {
  student: StudentProfileData;
}) {
  const [checkingLocation, setCheckingLocation] =
    useState(false);

  const [cameraActive, setCameraActive] =
    useState(false);

  const [photo, setPhoto] = useState("");
  const [submitting, setSubmitting] =
    useState(false);

  const [completed, setCompleted] =
    useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const videoRef =
    useRef<HTMLVideoElement>(null);

  const streamRef =
    useRef<MediaStream | null>(null);

  function stopCamera() {
    streamRef.current
      ?.getTracks()
      .forEach((track) => track.stop());

    streamRef.current = null;
    setCameraActive(false);
  }

  useEffect(() => {
    return () => stopCamera();
  }, []);

  function getCurrentPosition() {
    return new Promise<GeolocationPosition>(
      (resolve, reject) => {
        if (!navigator.geolocation) {
          reject(
            new Error(
              "Location is unavailable on this device.",
            ),
          );
          return;
        }

        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0,
          },
        );
      },
    );
  }

  async function beginTamam() {
    setError("");
    setMessage("");
    setPhoto("");
    setCheckingLocation(true);

    if (!student.face_enrolled) {
      setError(
        "Enroll your face in your profile first.",
      );
      setCheckingLocation(false);
      return;
    }

    try {
      const position =
        await getCurrentPosition();

      if (position.coords.accuracy > 500) {
        throw new Error(
          "Location accuracy is too low. Please enable precise location and retry.",
        );
      }

      const locationResult = await api<{
        inside: boolean;
        building_id: number;
        message: string;
      }>("/student/tamam/location-check", {
        method: "POST",
        body: JSON.stringify({
          latitude:
            position.coords.latitude,
          longitude:
            position.coords.longitude,
          accuracy_m:
            position.coords.accuracy,
        }),
      });

      if (!locationResult.inside) {
        throw new Error(
          "You are not inside your assigned hostel building.",
        );
      }

      setMessage(locationResult.message);

      if (
        !navigator.mediaDevices?.getUserMedia
      ) {
        throw new Error(
          "Camera access requires HTTPS or localhost.",
        );
      }

      const stream =
        await navigator.mediaDevices
          .getUserMedia({
            video: {
              facingMode: "user",
            },
            audio: false,
          });

      streamRef.current = stream;
      setCameraActive(true);

      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject =
            stream;

          void videoRef.current.play();
        }
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not verify your location.",
      );
    } finally {
      setCheckingLocation(false);
    }
  }

  function captureFace() {
    const video = videoRef.current;

    if (!video) {
      setError(
        "The camera is not ready. Please retry.",
      );
      return;
    }

    const canvas =
      document.createElement("canvas");

    canvas.width =
      video.videoWidth || 640;

    canvas.height =
      video.videoHeight || 480;

    const context =
      canvas.getContext("2d");

    if (!context) {
      setError(
        "Could not capture the face image.",
      );
      return;
    }

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    setPhoto(
      canvas.toDataURL(
        "image/jpeg",
        0.8,
      ),
    );

    stopCamera();
    setError("");
  }

  async function submitTamam() {
    if (!photo) {
      setError(
        "Capture your face before submitting.",
      );
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      // Read location again when submitting.
      const position =
        await getCurrentPosition();

      if (position.coords.accuracy > 500) {
        throw new Error(
          "Location accuracy is too low. Please retry.",
        );
      }

      const result = await api<{
        success: boolean;
        status: string;
        message: string;
        completed_at: string;
      }>("/student/tamam/check-in", {
        method: "POST",
        body: JSON.stringify({
          face_image: photo,
          latitude:
            position.coords.latitude,
          longitude:
            position.coords.longitude,
          accuracy_m:
            position.coords.accuracy,
        }),
      });

      setCompleted(result.success);
      setMessage(result.message);
      setPhoto("");
      stopCamera();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not record Tamam.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <StudentPage
      student={student}
      active="tamam"
    >
      <div className="student-screen-content">
        <header className="student-page-heading">
          <h1>Tamam</h1>
          <p>
            Verify your location and face to
            complete your daily Tamam.
          </p>
        </header>

        <section className="student-white-card">
          <h2>Daily Tamam</h2>

          <p>
            The camera will open only after
            confirming that you are inside your
            assigned hostel building.
          </p>

          {checkingLocation && (
            <div className="verification-note">
              <Clock3 />
              <div>
                <strong>
                  Checking your location...
                </strong>
                <p>
                  Please wait while we verify
                  your assigned building.
                </p>
              </div>
            </div>
          )}

          {message && (
            <div className="student-success">
              {message}
            </div>
          )}

          {error && (
            <div className="student-error">
              {error}
            </div>
          )}

          {!completed && (
            <div className="guardian-photo-capture">
              {photo ? (
                <img
                  src={photo}
                  alt="Tamam face capture"
                />
              ) : cameraActive ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                />
              ) : (
                <ClipboardCheck />
              )}

              <div>
                <strong>
                  Face Verification
                </strong>

                <p>
                  Complete your daily Tamam
                  using location and face
                  verification.
                </p>

                {!cameraActive &&
                  !photo && (
                    <button
                      type="button"
                      className="student-primary"
                      disabled={
                        checkingLocation ||
                        !student.face_enrolled
                      }
                      onClick={beginTamam}
                    >
                      <Camera />
                      {checkingLocation
                        ? "Checking location..."
                        : "Face Verification"}
                    </button>
                  )}

                {cameraActive && (
                  <button
                    type="button"
                    className="student-primary"
                    onClick={captureFace}
                  >
                    <Camera />
                    Capture Face
                  </button>
                )}

                {photo && (
                  <>
                    <button
                      type="button"
                      className="student-secondary"
                      disabled={submitting}
                      onClick={beginTamam}
                    >
                      Retake
                    </button>

                    <button
                      type="button"
                      className="student-primary"
                      disabled={submitting}
                      onClick={submitTamam}
                    >
                      <CheckCircle2 />
                      {submitting
                        ? "Recording..."
                        : "Complete Tamam"}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {completed && (
            <div className="verification-note">
              <CheckCircle2 />
              <div>
                <strong>
                  Tamam completed
                </strong>
                <p>
                  Your daily attendance has
                  been recorded successfully.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </StudentPage>
  );
}
function StatusPill({ text }: { text: string }) {
  return <span className="student-status-pill"><CheckCircle2 /> {text}</span>;
}


export function StudentApp() {
  const [student, setStudent] = useState<StudentProfileData | null>(null);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api<{ authenticated: boolean; student: StudentProfileData }>("/student/auth/me")
      .then((result) => setStudent(result.student))
      .catch(() => setStudent(null))
      .finally(() => setChecking(false));
  }, []);

  async function logout() {
    await api("/student/auth/logout", { method: "POST" }).catch(() => null);
    setStudent(null);
    navigate("/student/login");
  }

  if (checking) return <StudentLoading />;

  return (
    <Routes>
      <Route path="login" element={student ? <Navigate to="/student/home" replace /> : <StudentLogin onLogin={setStudent} />} />
      <Route path="home" element={student ? <StudentHomePage student={student} /> : <Navigate to="/student/login" replace />} />
      <Route path="access" element={student ? <DormAccessPage student={student} /> : <Navigate to="/student/login" replace />} />
      <Route path="verify/:requestId" element={student ? <FaceAndQrPage student={student} /> : <Navigate to="/student/login" replace />} />
      <Route path="id" element={student ? <StudentIdPage student={student} /> : <Navigate to="/student/login" replace />} />
      <Route
  path="tamam"
  element={
    student ? (
      <StudentTamamPage student={student} />
    ) : (
      <Navigate
        to="/student/login"
        replace
      />
    )
  }
/>
      <Route path="profile" element={student ? <StudentProfilePage student={student} onLogout={logout} /> : <Navigate to="/student/login" replace />} />
      <Route path="guardians" element={student ? <GuardianManagementPage student={student} /> : <Navigate to="/student/login" replace />} />
      <Route path="*" element={<Navigate to={student ? "/student/home" : "/student/login"} replace />} />
    </Routes>
  );
}


export function StudentKiosk() {
  const [token, setToken] = useState("");
  const [result, setResult] = useState<{ message: string; student: StudentProfileData } | null>(null);
  const [error, setError] = useState("");

  async function scan(event: FormEvent) {
    event.preventDefault();
    setError("");
    setResult(null);
    try {
      const response = await api<any>("/kiosk/student/scan", {
        method: "POST",
        body: JSON.stringify({ token: token.trim() }),
      });
      setResult({ message: response.message, student: response.student });
      setToken("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Scan failed");
    }
  }

  return (
    <main className="kiosk-page">
      <section className="kiosk-card">
        <div className="kiosk-logo"><ShieldCheck /> Hostel Access</div>
        <QrCode size={100} strokeWidth={1.2} />
        <h1>Scan Student QR Code</h1>
        <p>Present the five-minute access code to the scanner.</p>
        <form onSubmit={scan}>
          <input
            autoFocus
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Scanner input"
          />
          <button className="student-primary">Verify access</button>
        </form>
        {result && (
          <div className="kiosk-result success">
            <CheckCircle2 />
            <div><strong>{result.message}</strong><p>{result.student.full_name} · {result.student.university_id}</p></div>
          </div>
        )}
        {error && <div className="kiosk-result error"><XCircleIcon /> <strong>{error}</strong></div>}
      </section>
    </main>
  );
}


function XCircleIcon() {
  return <span className="x-circle">×</span>;
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatCountdown(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

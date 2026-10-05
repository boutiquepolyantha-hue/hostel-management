import {
  ArrowLeft, ArrowRight, Building2, Camera, Check, CheckCircle2,
  DoorOpen, Home, LogOut, ShieldCheck, UserRound, Users, X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import "./guardian.css";

type Action = "check_in" | "check_out";
interface LinkedStudent {
  id: number; university_id: string; full_name: string; building_name: string;
  room_number: string; current_status: string; relationship: string;
  allowed_actions: Action[];
}
interface Guardian {
  id: number; guardian_code: string; full_name: string; phone: string;
  identity_match: number; students: LinkedStudent[];
}
interface BatchResult {
  request_reference: string; guardian_name: string; action: Action;
  requests: { id: number; student_name: string; university_id: string; status: string }[];
}

const steps = ["Verify Identity", "Select Students", "Choose Action", "Request Sent"];

export function GuardianKiosk() {
  const [step, setStep] = useState(1);
  const [guardian, setGuardian] = useState<Guardian | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [action, setAction] = useState<Action | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [camera, setCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const navigate = useNavigate();

  useEffect(() => () => streamRef.current?.getTracks().forEach(t => t.stop()), []);

  async function startCamera() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera is unavailable here. Open the app on localhost or HTTPS, then allow camera access.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      setCamera(true);
      requestAnimationFrame(async () => { if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => null); } });
    } catch (reason) {
      const name = reason instanceof DOMException ? reason.name : "";
      setError(name === "NotAllowedError" ? "Camera permission was blocked. Allow it in your browser, then try again." : "No camera was found. Use localhost or HTTPS and make sure another app is not using the camera.");
    }
  }

  async function verifyFace() {
    setError("");
    setLoading(true);
    try {
      const response = await api<{ verified: boolean; guardian: Guardian }>("/kiosk/guardian/verify-face", {
        method: "POST", body: JSON.stringify({ guardian_code: "G-20001" }),
      });
      streamRef.current?.getTracks().forEach(t => t.stop());
      setGuardian(response.guardian);
      setStep(2);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Verification failed");
    } finally { setLoading(false); }
  }

  function toggle(id: number) {
    setSelected(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]);
  }

  const chosen = guardian?.students.filter(student => selected.includes(student.id)) ?? [];
  const canUse = (candidate: Action) => chosen.length > 0 && chosen.every(student => student.allowed_actions.includes(candidate));

  async function sendRequest() {
    if (!guardian || !action) return;
    setLoading(true); setError("");
    try {
      const response = await api<BatchResult>("/kiosk/guardian/access-requests", {
        method: "POST",
        body: JSON.stringify({ guardian_id: guardian.id, student_ids: selected, action }),
      });
      setResult(response); setStep(4);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send request");
    } finally { setLoading(false); }
  }

  function reset() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    setStep(1); setGuardian(null); setSelected([]); setAction(null);
    setConfirmed(false); setResult(null); setCamera(false); setError("");
  }

  return (
    <main className="guardian-kiosk">
      <header className="gk-header">
        <button className="gk-brand" onClick={() => navigate("/")}><ShieldCheck /> <span>Residence Management<small>SAFE HOMES · BRIGHTER TOMORROWS</small></span></button>
        <div className="gk-steps">{steps.map((label, index) => {
          const number = index + 1; const done = number < step; const active = number === step;
          return <div className={done ? "done" : active ? "active" : ""} key={label}><i>{done ? <Check /> : number}</i><span>{label}</span></div>;
        })}</div>
        <button className="gk-cancel" onClick={() => { reset(); navigate("/"); }}><X /> Cancel</button>
      </header>

      {step === 1 && <section className="gk-stage verify">
        <p className="gk-eyebrow">Guardian kiosk</p>
        <h1>Guardian Face Verification</h1>
        <p>Look at the camera to securely identify your approved profile</p>
        <article className="gk-camera-card">
          <div className="gk-camera">{camera ? <video ref={videoRef} autoPlay playsInline muted /> : <UserRound />}</div>
          <h2>Position your face inside the frame</h2>
          <p>Remove sunglasses and look directly at the camera</p>
          <span className="machine-ok"><Camera /> Verification machine connected <CheckCircle2 /></span>
          {!camera
            ? <button className="gk-primary" onClick={startCamera}><Camera /> Start Face Verification</button>
            : <button className="gk-primary" disabled={loading} onClick={verifyFace}><Camera /> {loading ? "Identifying profile…" : "Capture and identify me"}</button>}
          {error && <div className="gk-error">{error}</div>}
          <small><ShieldCheck /> Demo mode identifies guardian G-20001. Connect the Raspberry Pi face adapter before production.</small>
        </article>
      </section>}

      {step === 2 && guardian && <section className="gk-stage">
        <div className="gk-approved"><CheckCircle2 /> Face Verification Approved</div>
        <article className="guardian-profile"><div className="gk-avatar">{guardian.full_name.split(" ").map(x => x[0]).join("")}</div><div><h2>{guardian.full_name}</h2><p>Guardian ID: {guardian.guardian_code}</p><p>Mobile: {guardian.phone}</p></div><span><CheckCircle2 /> Identity Verified · {guardian.identity_match}%</span></article>
        <h1>Select Students</h1><p>Choose one or more linked students for dorm access.</p>
        <div className="gk-info">Only students linked to your approved guardian profile are shown.</div>
        <div className="student-picker">{guardian.students.map(student => <button className={selected.includes(student.id) ? "selected" : ""} key={student.id} onClick={() => toggle(student.id)}>
          <i>{selected.includes(student.id) && <Check />}</i><div className="gk-avatar small">{student.full_name.split(" ").map(x => x[0]).join("").slice(0,2)}</div>
          <div><h2>{student.full_name}</h2><p>{student.university_id}</p><p>{student.building_name} · Room {student.room_number}</p><span className={student.current_status}>{student.current_status === "inside" ? "Inside the Residence" : "Outside the Residence"}</span><small>Relationship: {student.relationship}</small></div>
        </button>)}</div>
        <footer className="gk-actions"><strong>{selected.length} student{selected.length === 1 ? "" : "s"} selected</strong><button className="gk-primary" disabled={!selected.length} onClick={() => setStep(3)}>Continue <ArrowRight /></button></footer>
      </section>}

      {step === 3 && guardian && <section className="gk-stage action-stage">
        <h1>Choose Dorm Access Action</h1><p>Select one action for all chosen students</p>
        <article className="selection-summary"><Users /><strong>{chosen.length} Students Selected</strong><div>{chosen.map(s => <span key={s.id}>{s.full_name} · {s.university_id}</span>)}</div><button onClick={() => setStep(2)}>Change selection</button></article>
        <div className="action-picker">
          <button disabled={!canUse("check_in")} className={action === "check_in" ? "selected enter" : "enter"} onClick={() => setAction("check_in")}><DoorOpen /><h2>Check-in</h2><p>Bring the selected students into the dorm</p></button>
          <button disabled={!canUse("check_out")} className={action === "check_out" ? "selected exit" : "exit"} onClick={() => setAction("check_out")}><LogOut /><h2>Check-out</h2><p>Take the selected students out of the dorm</p></button>
        </div>
        {!canUse("check_in") && !canUse("check_out") && <div className="gk-error">The selected students do not share one available action. Go back and change the selection.</div>}
        <article className="request-summary"><h2>Request Summary</h2><dl><dt>Guardian</dt><dd>{guardian.full_name}</dd><dt>Action</dt><dd>{action?.replace("_", "-") ?? "Select above"}</dd><dt>Students</dt><dd>{chosen.map(s => s.full_name).join(", ")}</dd><dt>QR delivery</dt><dd>Student Dorm Access</dd></dl>
          <div className="gk-info">Each student will receive the request in Dorm Access → QR & Face Verification.</div>
          <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> I confirm this access request</label>
        </article>
        {error && <div className="gk-error">{error}</div>}
        <footer className="gk-actions centered"><button className="gk-secondary" onClick={() => setStep(2)}><ArrowLeft /> Back</button><button className="gk-primary" disabled={!action || !confirmed || loading} onClick={sendRequest}>{loading ? "Sending…" : "Send Request"}</button></footer>
      </section>}

      {step === 4 && result && <section className="gk-stage sent">
        <CheckCircle2 className="sent-check" /><h1>Access Request Sent</h1><p>The selected student must confirm their face verification in the Student Portal. Their QR code will appear there afterwards.</p>
        <strong className="request-id">Request ID: {result.request_reference}</strong>
        <article className="sent-summary"><span>Guardian<strong>{result.guardian_name}</strong></span><span>Action<strong>{result.action.replace("_", "-")}</strong></span><span>Students<strong>{result.requests.length}</strong></span></article>
        <div className="sent-students">{result.requests.map(item => <article className="gk-qr-card" key={item.id}><UserRound /><div><h2>{item.student_name}</h2><p>{item.university_id}</p><span><CheckCircle2 /> Awaiting student face verification</span></div></article>)}</div>
        <div className="gk-info">Once the student verifies their face, the dorm scanner records this {result.action.replace("_", "-")} automatically when their QR is scanned.</div>
        <div className="expiry">The QR is created only after student face verification, is valid for five minutes, and can be scanned once.</div>
        <button className="gk-primary" onClick={reset}>Done</button>
      </section>}
    </main>
  );
}

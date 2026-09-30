export interface Supervisor {
  authenticated: boolean;
  id: number;
  full_name: string;
  email: string;
  role: string;
}

export interface Building {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  registered_students: number;
  currently_inside: number;
  alerts: number;
}

export interface Student {
  id: number;
  university_id: string;
  full_name: string;
  email: string;
  phone: string;
  city: string;
  building_id: number;
  room_number: string;
  current_status: string;
}

export interface DashboardData {
  building: { id: number; code: string; name: string };
  registered_students: number;
  currently_inside: number;
  currently_outside: number;
  tamam_pending: number;
  pending_guardian_approvals: number;
  recent_activity: Array<Student & {
    guardian_name: string;
    guardian_phone: string;
    action: string;
    occurred_at: string;
  }>;
}

export interface EntryExitData {
  summary: {
    total: number;
    inside: number;
    outside: number;
    check_ins: number;
    check_outs: number;
  };
  items: Array<Student & {
    record_id: number;
    guardian_name: string;
    guardian_phone: string;
    action: string;
    qr_status: string;
    face_status: string;
    occurred_at: string;
  }>;
}

export interface TamamData {
  summary: {
    total: number;
    completed: number;
    not_completed: number;
    outside_with_permit: number;
    completion_percent: number;
  };
  items: Array<Student & {
    tamam_status: string;
    verification_method: string | null;
    completed_at: string | null;
  }>;
}

export interface BusTrip {
  id: number;
  bus_number: string;
  destination: string;
  departure_at: string;
  capacity: number;
  status: string;
  expected: number;
  boarded: number;
}

export interface BusPassenger extends Student {
  passenger_id: number;
  boarding_status: string;
  verification_method: string | null;
  boarded_at: string | null;
}

export interface GuardianLink {
  id: number;
  status: string;
  relationship: string;
  can_check_in: boolean;
  can_check_out: boolean;
  requested_at: string;
  reviewed_at: string | null;
  supervisor_note: string | null;
  guardian: {
    id: number;
    guardian_code: string;
    full_name: string;
    emirates_id: string;
    email: string;
    phone: string;
    city: string;
    face_status: string;
    identity_match: number;
  };
  student: Student;
}


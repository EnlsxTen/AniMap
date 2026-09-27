export interface Favorite {
  id: number;
  item_type: 'event' | 'venue' | 'session';
  item_id: number;
  created_at: string;
  reminder_enabled: boolean;
  detail: any;
}

export interface Session {
  id: number;
  venue_id: number | null;
  user_id: number;
  game_name: string;
  game_type: 'boardgame' | 'murder_mystery' | 'card' | 'dance' | 'other';
  start_time: string;
  end_time: string;
  total_seats: number;
  booked_seats: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  description: string | null;
  price_per_person: string | null;
  address: string;
  latitude: number;
  longitude: number;
  status: 'open' | 'full' | 'cancelled';
  created_at: string;
  host_name?: string;
  venue_name?: string;
  venue_address?: string;
}

export interface SessionsResponse { sessions: Session[]; }
export interface SessionResponse { session: Session; registered?: boolean; message?: string; }

export interface User {
  id: number;
  email: string;
  username: string;
  phone?: string | null;
  role: 'merchant' | 'personal' | 'admin';
  approval_status?: 'pending' | 'approved' | 'rejected';
  avatar_url?: string | null;
  created_at?: string;
}

export interface MerchantReviewUser extends User {
  phone?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Event {
  id: number;
  user_id: number;
  name: string;
  poster_url: string | null;
  start_time: string;
  end_time: string;
  venue_name: string;
  address: string;
  latitude: number;
  longitude: number;
  ticket_price: string | null;
  ticket_url: string | null;
  description: string | null;
  display_until: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
  favorite_count?: number;
  merchant_name?: string;
  merchant_email?: string;
}

export interface EventComment {
  id: number;
  event_id: number;
  username: string;
  content: string;
  created_at: string;
}

export interface MyEventComment extends EventComment {
  event_name: string;
  event_start_time: string;
  event_poster_url: string | null;
}

export interface MyEventCommentsResponse {
  comments: MyEventComment[];
}

export interface DeleteCommentResponse {
  message: string;
  id: number;
}

export interface AdminUser extends User {
  updated_at?: string;
  analytics?: {
    total_duration_seconds: number;
    visit_count: number;
    last_seen_at?: string | null;
    last_ip?: string | null;
    last_ip_location?: string | null;
    last_device_type?: string | null;
    last_page_path?: string | null;
  };
}

export interface AdminUsersResponse {
  users: AdminUser[];
}

export interface VenueNavPhoto {
  id: number;
  venue_id?: number; // getVenueById 鐨?SELECT 涓嶈繑鍥炴瀛楁锛岃涓哄彲閫?
  photo_url: string;
  caption: string | null;
  sort_order: number;
}

export interface Venue {
  id: number;
  user_id: number;
  name: string;
  cover_url: string | null;
  address: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  business_hours: string | null;
  description: string | null;
  nav_guide: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
  owner_name?: string;
  owner_email?: string;
  nav_photos?: VenueNavPhoto[];
}

export interface VenuesResponse {
  venues: Venue[];
}

export interface VenueResponse {
  venue: Venue;
  message?: string;
}

export interface AuthResponse {
  message: string;
  token?: string;
  user: User;
  requiresApproval?: boolean;
}

export interface ProfileResponse {
  user: User;
}

export interface EventsResponse {
  events: Event[];
}

export interface EventResponse {
  event: Event;
  message?: string;
}

export interface EventCommentsResponse {
  comments: EventComment[];
}

export interface EventCommentResponse {
  comment: EventComment;
}

export interface PendingMerchantsResponse {
  merchants: MerchantReviewUser[];
}

export interface MerchantApprovalResponse {
  message: string;
  merchant: MerchantReviewUser;
}


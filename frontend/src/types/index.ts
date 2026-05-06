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
  game_type: 'boardgame' | 'murder_mystery' | 'card' | 'other';
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
  role: 'merchant' | 'personal' | 'admin';
  approval_status?: 'pending' | 'approved' | 'rejected';
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
  merchant_name?: string;
  merchant_email?: string;
}

export interface VenueNavPhoto {
  id: number;
  venue_id?: number; // getVenueById 的 SELECT 不返回此字段，设为可选
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

export interface EventsResponse {
  events: Event[];
}

export interface EventResponse {
  event: Event;
  message?: string;
}

export interface PendingMerchantsResponse {
  merchants: MerchantReviewUser[];
}

export interface MerchantApprovalResponse {
  message: string;
  merchant: MerchantReviewUser;
}

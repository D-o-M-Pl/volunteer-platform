// Kanoniczny format eventu (envelope) — zgodny z ustaleniami architektonicznymi
export interface EventEnvelope<T> {
  eventId: string;       // UUID — idempotencja
  eventType: string;     // np. "VolunteerRegistered.v1"
  occurredAt: string;    // ISO 8601 UTC
  producer: string;      // nazwa serwisu
  payload: T;
}

// --- Volunteer events ---

export interface VolunteerRegisteredPayload {
  volunteerId: string;
  email: string;
  name: string;
  skills: string[];
}

export interface VolunteerProfileUpdatedPayload {
  volunteerId: string;
  updatedFields: Partial<{ name: string; bio: string; skills: string[]; location: string }>;
  updatedBy: string;
}

// --- Task events ---

export interface TaskCreatedPayload {
  taskId: string;
  organizationId: string;
  title: string;
  requiredSkills: string[];
  maxVolunteers: number;
}

export interface TaskPublishedPayload {
  taskId: string;
  organizationId: string;
  publishedAt: string;
}

// --- Application events ---

export interface ApplicationSubmittedPayload {
  applicationId: string;
  volunteerId: string;
  taskId: string;
  matchScore?: number;
}

export interface ApplicationAcceptedPayload {
  applicationId: string;
  volunteerId: string;
  taskId: string;
  acceptedBy: string;
}

export type VolunteerRegistered = EventEnvelope<VolunteerRegisteredPayload>;
export type VolunteerProfileUpdated = EventEnvelope<VolunteerProfileUpdatedPayload>;
export type TaskCreated = EventEnvelope<TaskCreatedPayload>;
export type TaskPublished = EventEnvelope<TaskPublishedPayload>;
export type ApplicationSubmitted = EventEnvelope<ApplicationSubmittedPayload>;
export type ApplicationAccepted = EventEnvelope<ApplicationAcceptedPayload>;

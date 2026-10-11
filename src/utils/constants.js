const ROLES = { ADMIN: 'admin', MANAGER: 'sales_manager', EXECUTIVE: 'sales_executive' };

const LEAD_SOURCES = ['Website', 'Referral', 'Social Media', 'Email', 'Phone', 'Other'];
const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Unqualified', 'Converted', 'Lost'];
// "Converted" is only reachable through the conversion endpoint.
const LEAD_TRANSITIONS = {
  New: ['Contacted', 'Unqualified', 'Lost'],
  Contacted: ['Qualified', 'Unqualified', 'Lost'],
  Qualified: ['Contacted', 'Unqualified', 'Lost'],
  Unqualified: ['Contacted', 'Lost'],
  Lost: ['Contacted'],
  Converted: [],
};
const PRIORITIES = ['Low', 'Medium', 'High'];

const DEAL_STAGES = ['Qualification', 'Discovery', 'Proposal', 'Negotiation', 'Won', 'Lost'];
const ACTIVE_STAGES = ['Qualification', 'Discovery', 'Proposal', 'Negotiation'];
const CLOSED_STAGES = ['Won', 'Lost'];
const DEAL_TRANSITIONS = {
  Qualification: ['Discovery', 'Lost'],
  Discovery: ['Qualification', 'Proposal', 'Lost'],
  Proposal: ['Discovery', 'Negotiation', 'Lost'],
  Negotiation: ['Proposal', 'Won', 'Lost'],
  Won: [],
  Lost: [],
};
const STAGE_PROBABILITY = { Qualification: 10, Discovery: 25, Proposal: 50, Negotiation: 75, Won: 100, Lost: 0 };
const DEAL_STATUSES = ['open', 'won', 'lost'];

const ACTIVITY_TYPES = ['Call', 'Email', 'Meeting', 'Demo', 'Follow-up', 'Reminder', 'Note'];
// Stored values are Pending/Completed. "Overdue" is derived from dueDate at read time.
const ACTIVITY_STATUSES = ['Pending', 'Completed', 'Overdue'];
const RELATED_MODELS = ['Lead', 'Customer', 'Deal', 'User'];

const CUSTOMER_STATUSES = ['Active', 'Inactive'];

const TIMELINE_ACTIONS = {
  LEAD_CREATED: 'LEAD_CREATED',
  LEAD_UPDATED: 'LEAD_UPDATED',
  LEAD_ASSIGNED: 'LEAD_ASSIGNED',
  LEAD_REASSIGNED: 'LEAD_REASSIGNED',
  LEAD_STATUS_CHANGED: 'LEAD_STATUS_CHANGED',
  LEAD_PRIORITY_CHANGED: 'LEAD_PRIORITY_CHANGED',
  LEAD_CONVERTED: 'LEAD_CONVERTED',
  LEAD_DELETED: 'LEAD_DELETED',
  NOTE_ADDED: 'NOTE_ADDED',
  ACTIVITY_CREATED: 'ACTIVITY_CREATED',
  ACTIVITY_COMPLETED: 'ACTIVITY_COMPLETED',
  FOLLOWUP_CREATED: 'FOLLOWUP_CREATED',
  FOLLOWUP_COMPLETED: 'FOLLOWUP_COMPLETED',
  CUSTOMER_CREATED: 'CUSTOMER_CREATED',
  CUSTOMER_UPDATED: 'CUSTOMER_UPDATED',
  CUSTOMER_ASSIGNED: 'CUSTOMER_ASSIGNED',
  CUSTOMER_DELETED: 'CUSTOMER_DELETED',
  DEAL_CREATED: 'DEAL_CREATED',
  DEAL_UPDATED: 'DEAL_UPDATED',
  DEAL_STAGE_CHANGED: 'DEAL_STAGE_CHANGED',
  DEAL_ASSIGNED: 'DEAL_ASSIGNED',
  DEAL_REASSIGNED: 'DEAL_REASSIGNED',
  DEAL_WON: 'DEAL_WON',
  DEAL_LOST: 'DEAL_LOST',
  DEAL_REOPENED: 'DEAL_REOPENED',
  DEAL_DELETED: 'DEAL_DELETED',
};
const TIMELINE_ENTITIES = ['Lead', 'Customer', 'Deal'];

module.exports = {
  ROLES, LEAD_SOURCES, LEAD_STATUSES, LEAD_TRANSITIONS, PRIORITIES,
  DEAL_STAGES, ACTIVE_STAGES, CLOSED_STAGES, DEAL_TRANSITIONS, STAGE_PROBABILITY, DEAL_STATUSES,
  ACTIVITY_TYPES, ACTIVITY_STATUSES, RELATED_MODELS, CUSTOMER_STATUSES,
  TIMELINE_ACTIONS, TIMELINE_ENTITIES,
};

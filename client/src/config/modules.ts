import type { Role } from '../types/roles';

// Sidebar module list — order, numbering, names, and colors match
// Design.md ("Module icon system") and Modules.md exactly. `restrictedTo`
// implements Design.md's "Sidebar contents are filtered by the logged-in
// user's role/scope" — omitted means every logged-in role can see it.
export interface ModuleDef {
  id: number;
  key: string;
  name: string;
  color: string; // circular icon background
  path: string;
  restrictedTo?: Role[];
  // Sub-feature bullets for the module summary card (Design.md "Module
  // cards" / Modules.md section headers, verbatim).
  features: string[];
}

export const MODULES: ModuleDef[] = [
  {
    id: 1,
    key: 'demographic',
    name: 'Demographic',
    color: '#2563eb',
    path: '/modules/demographic',
    features: [
      'Affected Locations',
      'Population Status',
      'Demographic Composition',
      'Stranded Population',
      'Displaced Population',
      'Missing / Unaccounted',
      'Rescued / Evacuated',
      'Site Status & Last Update',
    ],
  },
  {
    id: 2,
    key: 'requirements',
    name: 'Necessity / Requirements',
    color: '#16a34a',
    path: '/modules/requirements',
    features: [
      'Requirement Overview',
      'New Requirements',
      'Pending Approval',
      'Approved Requirements',
      'Requirements in Progress',
      'Partially Fulfilled',
      'Fulfilled Requirements',
      'Critical / Urgent Requirements',
      'Requirement History',
    ],
  },
  {
    id: 3,
    key: 'resources',
    name: 'Resources & Inventory',
    color: '#ea580c',
    path: '/modules/resources',
    features: [
      'Resource Overview',
      'Government Inventory',
      'Organization Inventory',
      'Regional Storage Units',
      'Available Resources',
      'Allocated Resources',
      'Reserved Resources',
      'Inventory Movement',
      'Resource Contributions',
      'Cash & Fund Donations',
      'Inventory History',
    ],
  },
  {
    id: 4,
    key: 'transport',
    name: 'Transport & Distribution',
    color: '#7c3aed',
    path: '/modules/transport',
    features: [
      'Transport Overview',
      'Dispatches',
      'In Transit',
      'Delivery Status',
      'Vehicles & Transporters',
      'Routes',
      'Route Conditions',
      'Blocked / Disrupted Routes',
      'Delivery Confirmation',
      'Transport History',
    ],
  },
  {
    id: 5,
    key: 'situation',
    name: 'Situation & Coordination',
    color: '#0d9488',
    path: '/modules/situation',
    features: [
      'Current Situation',
      'Critical Locations',
      'Outstanding Requirements',
      'Resource Gaps',
      'Supply-Demand Status',
      'Response Actions',
      'Actions in Progress',
      'Delayed / At-Risk Actions',
      'Inter-Agency Coordination',
      'Situation History',
    ],
  },
  {
    id: 6,
    key: 'field-ops',
    name: 'Field Operations',
    color: '#db2777',
    path: '/modules/field-ops',
    features: [
      'Field Reports',
      'New Site Update',
      'Population Update',
      'Requirement Submission',
      'Resource Update',
      'Delivery Confirmation',
      'Hazard / Route Report',
      'Rescue / Evacuation Report',
      'Pending Synchronization',
      'Field Update History',
    ],
  },
  {
    id: 7,
    key: 'organizations',
    name: 'Organizations & Users',
    color: '#ca8a04',
    path: '/modules/organizations',
    features: [
      'Government Agencies',
      'NGOs / INGOs',
      'Private Organizations',
      'Volunteer Groups',
      'Field Teams',
      'Users & Roles',
      'Responsibilities / Assignments',
      'Verification Status',
    ],
  },
  {
    id: 8,
    key: 'reports',
    name: 'Reports & Analytics',
    color: '#1d4ed8',
    path: '/modules/reports',
    features: [
      'Situation Reports',
      'Requirement Reports',
      'Resource Reports',
      'Inventory Reports',
      'Transport Reports',
      'Distribution Reports',
      'Unfulfilled Requirements',
      'Response Timeline',
      'Export / Official Reports',
    ],
  },
  {
    id: 9,
    key: 'administration',
    name: 'Administration',
    color: '#4b5563',
    path: '/modules/administration',
    restrictedTo: ['central', 'district_cdo', 'municipality_ward'],
    features: [
      'Locations & Administrative Boundaries',
      'Disaster / Event Management',
      'Resource Categories',
      'Requirement Categories',
      'User Permissions',
      'Data Verification',
      'System Settings',
      'Synchronization / Data Management',
    ],
  },
];

export function modulesForRole(role: Role): ModuleDef[] {
  return MODULES.filter((m) => !m.restrictedTo || m.restrictedTo.includes(role));
}

// "How the System Works" strip (Appflow.md operating cycle / Design.md).
export const OPERATING_CYCLE = [
  { key: 'field_update', label: 'Field Update', description: 'Information collected by field teams', color: '#16a34a' },
  { key: 'data_integrated', label: 'Data Integrated', description: 'Stored & synchronized (online / offline)', color: '#2563eb' },
  { key: 'system_processing', label: 'System Processing', description: 'Data analyzed & status updated', color: '#7c3aed' },
  { key: 'decision_support', label: 'Decision Support', description: 'Insights for coordinators', color: '#ea580c' },
  { key: 'action_taken', label: 'Action Taken', description: 'Resources dispatched & delivered', color: '#0d9488' },
  { key: 'situation_updated', label: 'Situation Updated', description: 'Field confirms & cycle continues', color: '#16a34a' },
] as const;

// Feature strip (Design.md footer of dashboard).
export const FEATURE_STRIP = [
  { label: 'Real-time Updates', description: 'Information updated continuously' },
  { label: 'Offline First', description: 'Works without internet and syncs when available' },
  { label: 'Multi-Organization', description: 'Government, NGOs, volunteers all in one platform' },
  { label: 'Transparent & Accountable', description: 'Track every resource from source to delivery' },
  { label: 'Data-Driven Decisions', description: 'Better insights for faster, more effective response' },
] as const;

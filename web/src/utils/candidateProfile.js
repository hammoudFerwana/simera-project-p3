
export const PROFILE_FIELDS = [
  "first_name",
  "last_name",
  "headline",
  "summary",
  "phone",
  "industry",
  "profession",
  "city",
  "country_code",
];

export const SECTION_CONFIG = {
  work_experience: {
    title: "Work Experience",
    fields: [
      "job_title",
      "company_name",
      "start_date",
      "end_date",
      "is_current",
      "location",
      "employment_type",
      "work_mode",
      "description",
      "responsibilities",
      "achievements",
      "skills_used",
      "company_url",
    ],
  },
  education: {
    title: "Education",
    fields: [
      "institution_name",
      "degree_level",
      "degree_name",
      "field_of_study",
      "start_date",
      "end_date",
      "is_current",
      "gpa",
      "honors",
      "location",
      "description",
    ],
  },
  certifications: {
    title: "Certifications",
    fields: [
      "name",
      "issuing_organization",
      "issue_date",
      "expiration_date",
      "credential_id",
      "credential_url",
      "description",
    ],
  },
  projects: {
    title: "Projects",
    fields: [
      "name",
      "description",
      "role",
      "project_url",
      "start_date",
      "end_date",
    ],
  },
  awards: {
    title: "Awards",
    fields: [
      "name",
      "issuer",
      "award_date",
      "description",
    ],
  },
  publications: {
    title: "Publications",
    fields: [
      "title",
      "publisher",
      "publication_date",
      "url",
      "description",
    ],
  },
  volunteering: {
    title: "Volunteering",
    fields: [
      "organization",
      "role",
      "description",
      "start_date",
      "end_date",
      "is_current",
    ],
  },
  languages: {
    title: "Languages",
    fields: [
      "language",
      "proficiency_level",
    ],
  },
  links: {
    title: "Links",
    fields: [
      "link_type",
      "url",
      "label",
    ],
  },
  skills: {
    title: "Skills",
    fields: [
      "skill_id",
      "proficiency_level",
      "months_of_experience",
    ],
  },
};

export const formatLabel = (key = "") => {
  return key
    .replace(/([A-Z])/g, " $1")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const formatDate = (date) => {
  if (!date) return "—";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return String(date);
  }

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsedDate);
};

export const formatValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    return value.length ? value.map(formatValue).join(", ") : "—";
  }

  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
};

export const getFieldValue = (field) => {
  if (
    field !== null &&
    typeof field === "object" &&
    !Array.isArray(field) &&
    Object.prototype.hasOwnProperty.call(field, "value")
  ) {
    return field.value;
  }

  return field;
};

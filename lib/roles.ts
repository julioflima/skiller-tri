import type { User } from "./types";

export type Role = User["role"];

/** Papéis de uma escola (o dono é da plataforma). */
export const SCHOOL_ROLES = ["terapeuta", "gestor"] as const;
export type SchoolRole = (typeof SCHOOL_ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "dono",
  gestor: "administrador da escola",
  terapeuta: "terapeuta",
};

export const isSchoolRole = (role: string): role is SchoolRole => (SCHOOL_ROLES as readonly string[]).includes(role);

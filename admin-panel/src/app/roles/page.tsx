'use client';

import axios from 'axios';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader,
  RefreshCw,
  Shield,
  ShieldCheck,
  UsersRound
} from 'lucide-react';
import api from '@/lib/api';

interface PermissionRecord {
  id: string;
  module: string;
  resource: string;
  action: string;
  scope: string;
  description: string;
  isActive: boolean;
}

interface RoleRecord {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  isActive: boolean;
  permissions: PermissionRecord[];
}

interface AssignmentRole {
  name: string;
  hasRoleDefinition: boolean;
}

interface RolesResponse {
  roles: RoleRecord[];
  assignmentRoles: AssignmentRole[];
}

const titleCase = (value: string) => value
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const errorMessage = (error: unknown) => {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status === 401) return 'Your Admin session has expired. Sign in again to view roles.';
  if (status === 403) return 'This account is not authorized to view roles and access definitions.';
  if (status === 404) return 'The Roles read service is not available on the connected backend.';
  return 'Roles and permissions could not be loaded. Try again.';
};

export default function RolesPage() {
  const [data, setData] = useState<RolesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadRoles = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await api.get('/roles');
      const payload = response.data?.data as RolesResponse | undefined;
      if (response.data?.success !== true || !payload || !Array.isArray(payload.roles) || !Array.isArray(payload.assignmentRoles)) {
        throw new Error('Unexpected roles response');
      }
      setData(payload);
    } catch (requestError) {
      setData(null);
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRoles(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRoles]);

  const undefinedAssignments = data?.assignmentRoles.filter((role) => !role.hasRoleDefinition) || [];

  return (
    <div style={{ maxWidth: '1250px', margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap', marginBottom: '26px' }}>
        <div><h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>Roles &amp; Access</h1><p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '740px' }}>Read-only stored role definitions and their linked permissions. This screen does not alter access policy.</p></div>
        <Link href="/users" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 15px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--card-bg)', color: 'var(--text-primary)', fontWeight: '800', fontSize: '13px', textDecoration: 'none' }}><UsersRound size={17} /> Staff Management <ArrowRight size={15} /></Link>
      </header>

      {loading ? (
        <div style={{ minHeight: '300px', display: 'grid', placeItems: 'center', border: '1px solid var(--border-color)', borderRadius: '12px', background: 'var(--card-bg)' }}><Loader className="animate-spin" size={30} color="var(--accent-text)" aria-label="Loading roles" /></div>
      ) : error ? (
        <div role="alert" style={{ padding: '42px 20px', textAlign: 'center', border: '1px solid var(--danger-text)', borderRadius: '12px', background: 'var(--card-bg)' }}><AlertCircle size={38} color="var(--danger-text)" style={{ margin: '0 auto 12px' }} /><h2 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '800', marginBottom: '8px' }}>Roles unavailable</h2><p style={{ color: 'var(--danger-text)', fontSize: '13px', marginBottom: '16px' }}>{error}</p><button type="button" onClick={() => void loadRoles()} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 14px', border: 0, borderRadius: '8px', background: 'var(--primary)', color: '#0B132B', fontWeight: '800', cursor: 'pointer' }}><RefreshCw size={16} /> Retry</button></div>
      ) : data ? (
        <>
          {undefinedAssignments.length > 0 && (
            <section role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: '11px', padding: '15px 17px', marginBottom: '20px', border: '1px solid var(--warning-text)', borderRadius: '10px', background: 'var(--warning-light)' }}>
              <AlertCircle size={20} color="var(--warning-text)" style={{ flexShrink: 0, marginTop: '1px' }} />
              <div><h2 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '800', marginBottom: '5px' }}>Assignment roles without stored permission definitions</h2><p style={{ color: 'var(--warning-text)', fontSize: '12px', lineHeight: 1.55 }}>The User model permits {undefinedAssignments.map((role) => titleCase(role.name)).join(', ')}, but no matching Role documents were returned. They are shown as an architecture distinction, not merged with or granted the permissions below. Staff assignments remain under Staff Management.</p></div>
            </section>
          )}

          {data.roles.length === 0 ? (
            <div style={{ padding: '50px 20px', textAlign: 'center', border: '1px solid var(--border-color)', borderRadius: '12px', background: 'var(--card-bg)' }}><Shield size={42} color="var(--text-secondary)" style={{ opacity: 0.45, margin: '0 auto 13px' }} /><h2 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '800', marginBottom: '7px' }}>No stored role definitions</h2><p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>The backend returned an empty Role collection. No permission matrix has been invented.</p></div>
          ) : (
            <section style={{ display: 'grid', gap: '18px' }}>
              {data.roles.map((role) => {
                const grouped = role.permissions.reduce<Record<string, PermissionRecord[]>>((groups, permission) => {
                  (groups[permission.module] ||= []).push(permission);
                  return groups;
                }, {});

                return (
                  <article key={role.id} style={{ border: '1px solid var(--border-color)', borderRadius: '12px', background: 'var(--card-bg)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px', alignItems: 'flex-start', flexWrap: 'wrap', padding: '18px 20px', borderBottom: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}><span style={{ width: '42px', height: '42px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px', background: 'var(--primary-light)', color: 'var(--accent-text)', flexShrink: 0 }}>{role.isSystem ? <ShieldCheck size={21} /> : <Shield size={21} />}</span><div><h2 style={{ color: 'var(--text-primary)', fontSize: '17px', fontWeight: '800', marginBottom: '4px' }}>{titleCase(role.name)}</h2><p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{role.description || 'No stored description'}</p></div></div>
                      <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}><span style={{ padding: '5px 9px', borderRadius: '999px', background: role.isActive ? 'var(--success-light)' : 'var(--danger-light)', color: role.isActive ? 'var(--success-text)' : 'var(--danger-text)', fontSize: '11px', fontWeight: '800' }}>{role.isActive ? 'Active' : 'Inactive'}</span><span style={{ padding: '5px 9px', borderRadius: '999px', background: 'var(--bg-primary)', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: '800' }}>{role.isSystem ? 'System role' : 'Custom role'}</span></div>
                    </div>

                    <div style={{ padding: '18px 20px' }}>
                      {role.permissions.length === 0 ? <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No permissions are linked to this stored role.</p> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '13px' }}>{Object.entries(grouped).sort(([left], [right]) => left.localeCompare(right)).map(([module, permissions]) => <section key={module} style={{ padding: '14px', border: '1px solid var(--border-color)', borderRadius: '9px', background: 'var(--bg-primary)' }}><h3 style={{ display: 'flex', alignItems: 'center', gap: '7px', color: 'var(--text-primary)', fontSize: '13px', fontWeight: '800', marginBottom: '10px' }}><KeyRound size={15} color="var(--accent-text)" /> {titleCase(module)}</h3><div style={{ display: 'grid', gap: '8px' }}>{permissions.map((permission) => <div key={permission.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: permission.isActive ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '11px' }}><CheckCircle2 size={14} color={permission.isActive ? 'var(--success-text)' : 'var(--text-secondary)'} style={{ flexShrink: 0, marginTop: '1px' }} /><span><strong>{titleCase(permission.action)} {titleCase(permission.resource)}</strong> · {titleCase(permission.scope)} scope{permission.description ? <span style={{ display: 'block', color: 'var(--text-secondary)', marginTop: '2px' }}>{permission.description}</span> : null}{!permission.isActive ? <span style={{ display: 'block', color: 'var(--danger-text)', marginTop: '2px' }}>Inactive permission</span> : null}</span></div>)}</div></section>)}</div>}
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}

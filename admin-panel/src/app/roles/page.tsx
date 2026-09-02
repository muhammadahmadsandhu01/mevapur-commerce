'use client';

import axios from 'axios';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  RefreshCw,
  Shield,
  ShieldCheck,
  UsersRound
} from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Loading } from '@/components/ui/Loading';
import { EmptyState } from '@/components/ui/EmptyState';

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
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>Roles &amp; Access</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '740px' }}>Read-only stored role definitions and their linked permissions. This screen does not alter access policy.</p>
        </div>
        <Link href="/users" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 15px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--card-bg)', color: 'var(--text-primary)', fontWeight: '800', fontSize: '13px', textDecoration: 'none' }}>
          <UsersRound size={17} /> Staff Management <ArrowRight size={15} />
        </Link>
      </header>

      {loading ? (
        <Loading label="Loading roles and permissions..." minHeight="300px" />
      ) : error ? (
        <div style={{ display: 'grid', gap: '16px', maxWidth: '600px', margin: '40px auto' }}>
          <Alert type="error" title="Roles unavailable">
            {error}
          </Alert>
          <div style={{ textAlign: 'center' }}>
            <Button variant="primary" onClick={() => void loadRoles()}>
              <RefreshCw size={16} style={{ marginRight: '6px' }} /> Retry
            </Button>
          </div>
        </div>
      ) : data ? (
        <>
          {undefinedAssignments.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <Alert type="warning" title="Assignment roles without stored permission definitions">
                The User model permits {undefinedAssignments.map((role) => titleCase(role.name)).join(', ')}, but no matching Role documents were returned. They are shown as an architecture distinction, not merged with or granted the permissions below. Staff assignments remain under Staff Management.
              </Alert>
            </div>
          )}

          {data.roles.length === 0 ? (
            <EmptyState
              icon={<Shield size={48} />}
              title="No stored role definitions"
              description="The backend returned an empty Role collection. No permission matrix has been invented."
            />
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
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        <span style={{ width: '42px', height: '42px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px', background: 'var(--primary-light)', color: 'var(--accent-text)', flexShrink: 0 }}>
                          {role.isSystem ? <ShieldCheck size={21} /> : <Shield size={21} />}
                        </span>
                        <div>
                          <h2 style={{ color: 'var(--text-primary)', fontSize: '17px', fontWeight: '800', marginBottom: '4px' }}>{titleCase(role.name)}</h2>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{role.description || 'No stored description'}</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                        <span style={{ padding: '5px 9px', borderRadius: '999px', background: role.isActive ? 'var(--success-light)' : 'var(--danger-light)', color: role.isActive ? 'var(--success-text)' : 'var(--danger-text)', fontSize: '11px', fontWeight: '800' }}>
                          {role.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <span style={{ padding: '5px 9px', borderRadius: '999px', background: 'var(--bg-primary)', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: '800' }}>
                          {role.isSystem ? 'System role' : 'Custom role'}
                        </span>
                      </div>
                    </div>

                    <div style={{ padding: '18px 20px' }}>
                      {role.permissions.length === 0 ? (
                        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No permissions are linked to this stored role.</p>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '13px' }}>
                          {Object.entries(grouped).sort(([left], [right]) => left.localeCompare(right)).map(([module, permissions]) => (
                            <section key={module} style={{ padding: '14px', border: '1px solid var(--border-color)', borderRadius: '9px', background: 'var(--bg-primary)' }}>
                              <h3 style={{ display: 'flex', alignItems: 'center', gap: '7px', color: 'var(--text-primary)', fontSize: '13px', fontWeight: '800', marginBottom: '10px' }}>
                                <KeyRound size={15} color="var(--accent-text)" /> {titleCase(module)}
                              </h3>
                              <div style={{ display: 'grid', gap: '8px' }}>
                                {permissions.map((permission) => (
                                  <div key={permission.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: permission.isActive ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '11px' }}>
                                    <CheckCircle2 size={14} color={permission.isActive ? 'var(--success-text)' : 'var(--text-secondary)'} style={{ flexShrink: 0, marginTop: '1px' }} />
                                    <span>
                                      <strong>{titleCase(permission.action)} {titleCase(permission.resource)}</strong> · {titleCase(permission.scope)} scope
                                      {permission.description ? <span style={{ display: 'block', color: 'var(--text-secondary)', marginTop: '2px' }}>{permission.description}</span> : null}
                                      {!permission.isActive ? <span style={{ display: 'block', color: 'var(--danger-text)', marginTop: '2px' }}>Inactive permission</span> : null}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </section>
                          ))}
                        </div>
                      )}
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

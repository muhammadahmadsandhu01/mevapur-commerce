'use client';

import axios from 'axios';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent
} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  LayoutPanelTop,
  Loader,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X
} from 'lucide-react';
import api from '@/lib/api';

type ContentType = 'page' | 'banner' | 'slider' | 'blog';

interface ContentRecord {
  _id: string;
  type: ContentType;
  title: string;
  slug?: string;
  subtitle?: string;
  description?: string;
  content?: string;
  image?: string;
  position: number;
  isActive: boolean;
  isFeatured: boolean;
  startDate?: string | null;
  endDate?: string | null;
  views: number;
  createdAt: string;
  updatedAt: string;
}

interface ContentForm {
  type: ContentType;
  title: string;
  slug: string;
  subtitle: string;
  description: string;
  content: string;
  image: string;
  position: string;
  isActive: boolean;
  isFeatured: boolean;
  startDate: string;
  endDate: string;
}

const contentTypes: Array<{
  value: ContentType;
  label: string;
  singular: string;
  icon: typeof FileText;
}> = [
  { value: 'page', label: 'Pages', singular: 'page', icon: FileText },
  { value: 'banner', label: 'Banners', singular: 'banner', icon: ImageIcon },
  { value: 'slider', label: 'Sliders', singular: 'slider', icon: LayoutPanelTop },
  { value: 'blog', label: 'Blogs', singular: 'blog post', icon: FileText }
];

const isContentType = (value: string | null): value is ContentType => (
  contentTypes.some((type) => type.value === value)
);

const emptyForm = (type: ContentType): ContentForm => ({
  type,
  title: '',
  slug: '',
  subtitle: '',
  description: '',
  content: '',
  image: '',
  position: '0',
  isActive: true,
  isFeatured: false,
  startDate: '',
  endDate: ''
});

const toDateTimeInput = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const recordToForm = (record: ContentRecord): ContentForm => ({
  type: record.type,
  title: record.title,
  slug: record.slug || '',
  subtitle: record.subtitle || '',
  description: record.description || '',
  content: record.content || '',
  image: record.image || '',
  position: String(record.position ?? 0),
  isActive: record.isActive,
  isFeatured: record.isFeatured,
  startDate: toDateTimeInput(record.startDate),
  endDate: toDateTimeInput(record.endDate)
});

const formatDate = (value?: string | null) => {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Invalid date'
    : new Intl.DateTimeFormat('en-PK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(date);
};

const sortRecords = (records: ContentRecord[]) => (
  [...records].sort((left, right) => (
    left.position - right.position
    || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  ))
);

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  background: 'var(--input-bg)',
  color: 'var(--text-primary)',
  fontSize: '13px',
  outline: 'none'
};

function ContentManagement() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedType = searchParams.get('type');
  const activeType: ContentType = isContentType(requestedType) ? requestedType : 'page';
  const activeDefinition = contentTypes.find((type) => type.value === activeType)!;
  const ActiveIcon = activeDefinition.icon;
  const requestSequence = useRef(0);

  const [records, setRecords] = useState<ContentRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ContentRecord | null>(null);
  const [form, setForm] = useState<ContentForm>(() => emptyForm('page'));
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState('');

  useEffect(() => {
    if (!isContentType(requestedType)) {
      router.replace('/content?type=page', { scroll: false });
    }
  }, [requestedType, router]);

  const loadContent = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setLoadError('');

    try {
      const response = await api.get('/content', {
        params: { type: activeType, search: search.trim() || undefined },
        signal
      });
      if (response.data?.success !== true || !Array.isArray(response.data.data)) {
        throw new Error('Unexpected content response');
      }
      if (sequence === requestSequence.current) {
        setRecords(sortRecords(response.data.data));
      }
    } catch (error) {
      if (axios.isCancel(error) || signal?.aborted) return;
      if (sequence === requestSequence.current) {
        setLoadError('Content could not be loaded. Confirm your Admin session and try again.');
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [activeType, search]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadContent(controller.signal);
    }, search ? 300 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadContent, search]);

  useEffect(() => {
    if (!showForm) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setShowForm(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [saving, showForm]);

  const selectType = (type: ContentType) => {
    if (type === activeType) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('type', type);
    setActionError('');
    setSuccess('');
    setShowForm(false);
    router.push(`/content?${params.toString()}`, { scroll: false });
  };

  const openCreateForm = () => {
    setEditingRecord(null);
    setForm(emptyForm(activeType));
    setFormErrors({});
    setActionError('');
    setShowForm(true);
  };

  const openEditForm = (record: ContentRecord) => {
    setEditingRecord(record);
    setForm(recordToForm(record));
    setFormErrors({});
    setActionError('');
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setEditingRecord(null);
    setFormErrors({});
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    const position = Number(form.position);

    if (!form.title.trim()) errors.title = 'Title is required.';
    if (form.title.trim().length > 200) errors.title = 'Title must not exceed 200 characters.';
    if (form.subtitle.trim().length > 300) errors.subtitle = 'Subtitle must not exceed 300 characters.';
    if (form.description.trim().length > 1000) errors.description = 'Description must not exceed 1,000 characters.';
    if (form.content.length > 50000) errors.content = 'Content must not exceed 50,000 characters.';
    if (!Number.isFinite(position)) errors.position = 'Position must be a finite number.';
    if (form.startDate && form.endDate && new Date(form.endDate) < new Date(form.startDate)) {
      errors.endDate = 'End date must not be earlier than the start date.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submitContent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !validateForm()) return;

    setSaving(true);
    setActionError('');
    setSuccess('');

    const payload = {
      type: form.type,
      title: form.title.trim(),
      slug: form.slug.trim().toLowerCase() || undefined,
      subtitle: form.subtitle.trim(),
      description: form.description.trim(),
      content: form.content,
      image: form.image.trim(),
      position: Number(form.position),
      isActive: form.isActive,
      isFeatured: form.type === 'blog' ? form.isFeatured : false,
      startDate: ['banner', 'slider'].includes(form.type) && form.startDate
        ? new Date(form.startDate).toISOString()
        : null,
      endDate: ['banner', 'slider'].includes(form.type) && form.endDate
        ? new Date(form.endDate).toISOString()
        : null
    };

    try {
      const response = editingRecord
        ? await api.put(`/content/${editingRecord._id}`, payload)
        : await api.post('/content', payload);
      const saved = response.data?.data as ContentRecord | undefined;
      if (response.data?.success !== true || !saved?._id) {
        throw new Error('Unexpected content response');
      }

      setRecords((current) => {
        const withoutPrevious = current.filter((record) => record._id !== saved._id);
        return saved.type === activeType
          ? sortRecords([...withoutPrevious, saved])
          : withoutPrevious;
      });
      setSuccess(editingRecord ? 'Content changes saved.' : 'Content created.');
      setShowForm(false);
      setEditingRecord(null);
    } catch {
      setActionError('The content could not be saved. Review the fields and try again.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (record: ContentRecord) => {
    if (updatingId) return;
    setUpdatingId(record._id);
    setActionError('');
    setSuccess('');

    try {
      const response = await api.put(`/content/${record._id}`, {
        isActive: !record.isActive
      });
      const updated = response.data?.data as ContentRecord | undefined;
      if (response.data?.success !== true || !updated?._id) {
        throw new Error('Unexpected content response');
      }
      setRecords((current) => sortRecords(current.map((item) => (
        item._id === updated._id ? updated : item
      ))));
      setSuccess(updated.isActive ? 'Content activated.' : 'Content deactivated.');
    } catch {
      setActionError('Status could not be changed. The existing status was preserved.');
    } finally {
      setUpdatingId('');
    }
  };

  const deleteContent = async (record: ContentRecord) => {
    if (updatingId || !window.confirm(`Delete “${record.title}”? This action cannot be undone.`)) return;
    setUpdatingId(record._id);
    setActionError('');
    setSuccess('');

    try {
      const response = await api.delete(`/content/${record._id}`);
      if (response.data?.success !== true) throw new Error('Unexpected content response');
      setRecords((current) => current.filter((item) => item._id !== record._id));
      setSuccess('Content deleted.');
    } catch {
      setActionError('Content could not be deleted. No local changes were made.');
    } finally {
      setUpdatingId('');
    }
  };

  const showImageField = ['banner', 'slider', 'blog'].includes(form.type);
  const showBodyField = ['page', 'blog'].includes(form.type);
  const showScheduleFields = ['banner', 'slider'].includes(form.type);

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '18px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>Content Management</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '720px' }}>Manage the four content types supported by the protected Content API.</p>
        </div>
        <button type="button" onClick={openCreateForm} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '11px 16px', border: 0, borderRadius: '9px', background: 'var(--primary)', color: '#0B132B', fontWeight: '800', cursor: 'pointer' }}>
          <Plus size={18} /> Add {activeDefinition.singular}
        </button>
      </header>

      <div role="tablist" aria-label="Content types" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px', marginBottom: '20px' }}>
        {contentTypes.map((type) => {
          const Icon = type.icon;
          const selected = activeType === type.value;
          return (
            <button key={type.value} type="button" role="tab" aria-selected={selected} onClick={() => selectType(type.value)} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', padding: '10px 15px', border: selected ? '1px solid var(--primary)' : '1px solid var(--border-color)', borderRadius: '9px', background: selected ? 'var(--primary-light)' : 'var(--card-bg)', color: selected ? 'var(--accent-text)' : 'var(--text-secondary)', fontWeight: '800', cursor: 'pointer' }}>
              <Icon size={17} /> {type.label}
            </button>
          );
        })}
      </div>

      <section style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: '11px', background: 'var(--card-bg)', marginBottom: '18px' }}>
        <label htmlFor="content-search" style={{ display: 'block', color: 'var(--text-primary)', fontSize: '12px', fontWeight: '800', marginBottom: '7px' }}>Search {activeDefinition.label.toLowerCase()}</label>
        <div style={{ position: 'relative', maxWidth: '560px' }}>
          <Search size={17} color="var(--text-secondary)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input id="content-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, slug or description" style={{ ...inputStyle, paddingLeft: '38px' }} />
        </div>
      </section>

      {actionError && <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 13px', marginBottom: '16px', borderRadius: '8px', background: 'var(--danger-light)', color: 'var(--danger-text)', fontSize: '13px', fontWeight: '700' }}><AlertCircle size={17} /> {actionError}</div>}
      {success && <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 13px', marginBottom: '16px', borderRadius: '8px', background: 'var(--success-light)', color: 'var(--success-text)', fontSize: '13px', fontWeight: '700' }}><CheckCircle2 size={17} /> {success}</div>}

      {loading ? (
        <div style={{ minHeight: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)', borderRadius: '12px', background: 'var(--card-bg)' }}><Loader className="animate-spin" size={30} color="var(--accent-text)" aria-label="Loading content" /></div>
      ) : loadError ? (
        <div role="alert" style={{ padding: '42px 20px', textAlign: 'center', border: '1px solid var(--danger-text)', borderRadius: '12px', background: 'var(--card-bg)' }}>
          <AlertCircle size={38} color="var(--danger-text)" style={{ margin: '0 auto 12px' }} />
          <h2 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '800', marginBottom: '8px' }}>Content unavailable</h2>
          <p style={{ color: 'var(--danger-text)', fontSize: '13px', marginBottom: '16px' }}>{loadError}</p>
          <button type="button" onClick={() => void loadContent()} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 14px', border: 0, borderRadius: '8px', background: 'var(--primary)', color: '#0B132B', fontWeight: '800', cursor: 'pointer' }}><RefreshCw size={16} /> Retry</button>
        </div>
      ) : records.length === 0 ? (
        <div style={{ padding: '54px 20px', textAlign: 'center', border: '1px solid var(--border-color)', borderRadius: '12px', background: 'var(--card-bg)' }}>
          <ActiveIcon size={42} color="var(--text-secondary)" style={{ opacity: 0.45, margin: '0 auto 13px' }} />
          <h2 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '800', marginBottom: '7px' }}>No {activeDefinition.label.toLowerCase()} found</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '17px' }}>{search ? 'Clear the search or try a different term.' : `Create the first ${activeDefinition.singular} when it is ready to publish.`}</p>
          {!search && <button type="button" onClick={openCreateForm} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 14px', border: 0, borderRadius: '8px', background: 'var(--primary)', color: '#0B132B', fontWeight: '800', cursor: 'pointer' }}><Plus size={16} /> Add {activeDefinition.singular}</button>}
        </div>
      ) : (
        <section style={{ border: '1px solid var(--border-color)', borderRadius: '12px', background: 'var(--card-bg)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '940px', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--bg-primary)' }}>{['Content', 'Position', 'Schedule', 'Visibility', 'Featured', 'Actions'].map((heading) => <th key={heading} style={{ padding: '13px 15px', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{heading}</th>)}</tr></thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record._id} style={{ borderTop: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '15px', maxWidth: '390px' }}><div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '800', marginBottom: '4px' }}>{record.title}</div><div style={{ color: 'var(--accent-text)', fontSize: '11px', fontFamily: 'monospace', marginBottom: '4px' }}>/{record.slug || 'no-slug'}</div><div style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.45 }}>{record.subtitle || record.description || 'No summary provided'}</div></td>
                    <td style={{ padding: '15px', color: 'var(--text-primary)', fontSize: '13px', fontWeight: '700' }}>{record.position ?? 0}</td>
                    <td style={{ padding: '15px', color: 'var(--text-secondary)', fontSize: '12px', whiteSpace: 'nowrap' }}>{record.startDate || record.endDate ? `${formatDate(record.startDate)} – ${formatDate(record.endDate)}` : 'Always available'}</td>
                    <td style={{ padding: '15px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 9px', borderRadius: '999px', background: record.isActive ? 'var(--success-light)' : 'var(--bg-primary)', color: record.isActive ? 'var(--success-text)' : 'var(--text-secondary)', fontSize: '11px', fontWeight: '800' }}>{record.isActive ? <Eye size={13} /> : <EyeOff size={13} />} {record.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td style={{ padding: '15px', color: record.isFeatured ? 'var(--accent-text)' : 'var(--text-secondary)', fontSize: '12px', fontWeight: '700' }}>{record.type === 'blog' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Star size={14} /> {record.isFeatured ? 'Featured' : 'Standard'}</span> : 'Not applicable'}</td>
                    <td style={{ padding: '15px' }}>
                      <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => openEditForm(record)} disabled={Boolean(updatingId)} aria-label={`Edit ${record.title}`} style={{ display: 'inline-flex', padding: '7px', border: '1px solid var(--border-color)', borderRadius: '7px', background: 'var(--card-bg)', color: 'var(--text-primary)', cursor: updatingId ? 'not-allowed' : 'pointer' }}><Edit3 size={15} /></button>
                        <button type="button" onClick={() => void toggleActive(record)} disabled={Boolean(updatingId)} aria-label={`${record.isActive ? 'Deactivate' : 'Activate'} ${record.title}`} style={{ display: 'inline-flex', padding: '7px', border: '1px solid var(--border-color)', borderRadius: '7px', background: 'var(--card-bg)', color: record.isActive ? 'var(--warning-text)' : 'var(--success-text)', cursor: updatingId ? 'not-allowed' : 'pointer' }}>{updatingId === record._id ? <Loader className="animate-spin" size={15} /> : record.isActive ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                        <button type="button" onClick={() => void deleteContent(record)} disabled={Boolean(updatingId)} aria-label={`Delete ${record.title}`} style={{ display: 'inline-flex', padding: '7px', border: 0, borderRadius: '7px', background: 'var(--danger-light)', color: 'var(--danger-text)', cursor: updatingId ? 'not-allowed' : 'pointer' }}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {showForm && (
        <div role="dialog" aria-modal="true" aria-labelledby="content-form-title" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }} style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px', background: 'rgba(11, 19, 43, 0.72)', backdropFilter: 'blur(3px)' }}>
          <form onSubmit={submitContent} style={{ width: 'min(880px, 100%)', maxHeight: '92vh', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '14px', background: 'var(--card-bg)', boxShadow: '0 24px 80px rgba(0, 0, 0, 0.32)' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '17px 20px', borderBottom: '1px solid var(--border-color)', background: 'var(--card-bg)' }}>
              <div><h2 id="content-form-title" style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '800', marginBottom: '3px' }}>{editingRecord ? 'Edit content' : 'Create content'}</h2><p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Fields follow the stored Content model.</p></div>
              <button type="button" onClick={closeForm} disabled={saving} aria-label="Close content form" style={{ display: 'inline-flex', padding: '7px', border: 0, borderRadius: '7px', background: 'var(--bg-primary)', color: 'var(--text-secondary)', cursor: saving ? 'not-allowed' : 'pointer' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'grid', gap: '18px', padding: '20px' }}>
              {actionError && <div role="alert" style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--danger-light)', color: 'var(--danger-text)', fontSize: '12px', fontWeight: '700' }}>{actionError}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px' }}>
                <label style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '800' }}>Type<select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as ContentType }))} style={{ ...inputStyle, marginTop: '7px' }}>{contentTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
                <label style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '800' }}>Position<input type="number" value={form.position} onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))} style={{ ...inputStyle, marginTop: '7px' }} />{formErrors.position && <span style={{ display: 'block', color: 'var(--danger-text)', fontSize: '11px', marginTop: '5px' }}>{formErrors.position}</span>}</label>
              </div>
              <label style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '800' }}>Title *<input autoFocus type="text" maxLength={200} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} style={{ ...inputStyle, marginTop: '7px' }} />{formErrors.title && <span style={{ display: 'block', color: 'var(--danger-text)', fontSize: '11px', marginTop: '5px' }}>{formErrors.title}</span>}</label>
              <label style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '800' }}>Slug<input type="text" value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} placeholder="Generated from the title when left blank" style={{ ...inputStyle, marginTop: '7px' }} /></label>
              <label style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '800' }}>Subtitle<input type="text" maxLength={300} value={form.subtitle} onChange={(event) => setForm((current) => ({ ...current, subtitle: event.target.value }))} style={{ ...inputStyle, marginTop: '7px' }} />{formErrors.subtitle && <span style={{ display: 'block', color: 'var(--danger-text)', fontSize: '11px', marginTop: '5px' }}>{formErrors.subtitle}</span>}</label>
              <label style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '800' }}>Description<textarea maxLength={1000} rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} style={{ ...inputStyle, marginTop: '7px', resize: 'vertical' }} />{formErrors.description && <span style={{ display: 'block', color: 'var(--danger-text)', fontSize: '11px', marginTop: '5px' }}>{formErrors.description}</span>}</label>
              {showBodyField && <label style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '800' }}>Content<textarea maxLength={50000} rows={9} value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} style={{ ...inputStyle, marginTop: '7px', resize: 'vertical' }} />{formErrors.content && <span style={{ display: 'block', color: 'var(--danger-text)', fontSize: '11px', marginTop: '5px' }}>{formErrors.content}</span>}</label>}
              {showImageField && <label style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '800' }}>Image URL<input type="url" value={form.image} onChange={(event) => setForm((current) => ({ ...current, image: event.target.value }))} style={{ ...inputStyle, marginTop: '7px' }} /></label>}
              {showScheduleFields && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px' }}><label style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '800' }}>Start date<input type="datetime-local" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} style={{ ...inputStyle, marginTop: '7px' }} /></label><label style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '800' }}>End date<input type="datetime-local" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} style={{ ...inputStyle, marginTop: '7px' }} />{formErrors.endDate && <span style={{ display: 'block', color: 'var(--danger-text)', fontSize: '11px', marginTop: '5px' }}>{formErrors.endDate}</span>}</label></div>}
              <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap' }}><label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontSize: '13px', fontWeight: '700' }}><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /> Active</label>{form.type === 'blog' && <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontSize: '13px', fontWeight: '700' }}><input type="checkbox" checked={form.isFeatured} onChange={(event) => setForm((current) => ({ ...current, isFeatured: event.target.checked }))} /> Featured</label>}</div>
            </div>

            <div style={{ position: 'sticky', bottom: 0, display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '15px 20px', borderTop: '1px solid var(--border-color)', background: 'var(--card-bg)' }}>
              <button type="button" onClick={closeForm} disabled={saving} style={{ padding: '10px 15px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--card-bg)', color: 'var(--text-primary)', fontWeight: '700', cursor: saving ? 'not-allowed' : 'pointer' }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', border: 0, borderRadius: '8px', background: saving ? 'var(--text-secondary)' : 'var(--primary)', color: saving ? '#FFFFFF' : '#0B132B', fontWeight: '800', cursor: saving ? 'wait' : 'pointer' }}>{saving && <Loader className="animate-spin" size={16} />} {saving ? 'Saving…' : editingRecord ? 'Save changes' : 'Create content'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default function ContentPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '280px', display: 'grid', placeItems: 'center' }}><Loader className="animate-spin" size={30} color="var(--accent-text)" aria-label="Loading content view" /></div>}>
      <ContentManagement />
    </Suspense>
  );
}

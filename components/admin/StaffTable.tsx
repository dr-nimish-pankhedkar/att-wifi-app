'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Pencil, Trash2, Plus, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';

interface ShiftOption {
  id: string;
  name: string;
  start_time: string;
}

interface StaffMember {
  id: string;
  name: string;
  designation: string | null;
  photo_url: string | null;
  role: string;
  created_at: string;
  shift_id: string | null;
  shifts: ShiftOption | null;
}

interface StaffTableProps {
  staff: StaffMember[];
  shifts: ShiftOption[];
  onRefresh: () => void;
}

const EMPTY_FORM = { name: '', designation: '', pin: '', photo_url: '', shift_id: '' };

export function StaffTableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export default function StaffTable({ staff, shifts, onRefresh }: StaffTableProps) {
  const [editTarget, setEditTarget] = useState<StaffMember | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const supabase = createClient();

  async function uploadPhoto(file: File): Promise<string | null> {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('staff-photos').upload(path, file);
      if (error) { toast.error('Photo upload failed'); return null; }
      const { data } = supabase.storage.from('staff-photos').getPublicUrl(path);
      return data.publicUrl;
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editTarget) {
        const res = await fetch(`/api/staff/${editTarget.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name || undefined,
            designation: form.designation || undefined,
            pin: form.pin || undefined,
            photo_url: form.photo_url || undefined,
            shift_id: form.shift_id || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error); return; }
        toast.success('Staff updated');
      } else {
        const res = await fetch('/api/staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, shift_id: form.shift_id || null }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error); return; }
        toast.success('Staff member added');
      }
      setShowAdd(false);
      setEditTarget(null);
      setForm(EMPTY_FORM);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    const res = await fetch(`/api/staff/${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Staff member deleted'); onRefresh(); }
    else toast.error('Delete failed');
  }

  function openEdit(member: StaffMember) {
    setEditTarget(member);
    setForm({
      name: member.name,
      designation: member.designation ?? '',
      pin: '',
      photo_url: member.photo_url ?? '',
      shift_id: member.shift_id ?? '',
    });
    setShowAdd(true);
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={() => { setEditTarget(null); setForm(EMPTY_FORM); setShowAdd(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Add Staff
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Photo</th>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Designation</th>
              <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Shift</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Joined</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => (
              <tr key={member.id} className="border-t hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  {member.photo_url ? (
                    <Image
                      src={member.photo_url}
                      alt={member.name}
                      width={36}
                      height={36}
                      className="rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                      {member.name[0].toUpperCase()}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-medium">{member.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{member.designation ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                  {member.shifts ? (
                    <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {member.shifts.name}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Default</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                  {new Date(member.created_at).toLocaleDateString('en-IN')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(member)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => handleDelete(member.id, member.name)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!staff.length && (
          <div className="text-center py-12 text-muted-foreground">No staff members yet.</div>
        )}
      </div>

      <Dialog open={showAdd} onOpenChange={(v) => { if (!v) { setShowAdd(false); setEditTarget(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Staff Member' : 'Add Staff Member'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
            </div>
            <div>
              <Label>Designation</Label>
              <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Developer" />
            </div>
            <div>
              <Label>PIN{editTarget ? ' (leave blank to keep)' : ' *'}</Label>
              <Input
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                placeholder="4-digit PIN"
                maxLength={4}
                inputMode="numeric"
              />
            </div>
            <div>
              <Label>Shift Assignment</Label>
              <Select
                value={form.shift_id || 'default'}
                onValueChange={(v) => setForm({ ...form, shift_id: v === 'default' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Use default shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default (use global settings)</SelectItem>
                  {shifts.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · {s.start_time.slice(0, 5)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Profile Photo</Label>
              <div className="flex gap-2 items-center mt-1">
                <label className="cursor-pointer flex items-center gap-2 px-3 py-2 border rounded-md text-sm hover:bg-muted transition-colors">
                  <Upload className="w-4 h-4" />
                  {uploading ? 'Uploading…' : 'Upload Photo'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const url = await uploadPhoto(file);
                        if (url) setForm({ ...form, photo_url: url });
                      }
                    }}
                  />
                </label>
                {form.photo_url && (
                  <Image src={form.photo_url} alt="Preview" width={36} height={36} className="rounded-full object-cover" />
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || uploading}>
              {saving ? 'Saving…' : editTarget ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

export interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string | null;
  late_threshold_minutes: number;
}

const EMPTY: Omit<Shift, 'id'> = {
  name: '',
  start_time: '09:00',
  end_time: '',
  late_threshold_minutes: 15,
};

interface Props {
  shifts: Shift[];
  onRefresh: () => void;
}

export default function ShiftManager({ shifts, onRefresh }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Shift | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  function openAdd() {
    setEditTarget(null);
    setForm(EMPTY);
    setShowForm(true);
  }

  function openEdit(shift: Shift) {
    setEditTarget(shift);
    setForm({
      name: shift.name,
      start_time: shift.start_time.slice(0, 5),
      end_time: shift.end_time ? shift.end_time.slice(0, 5) : '',
      late_threshold_minutes: shift.late_threshold_minutes,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name || !form.start_time) { toast.error('Name and start time are required'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        start_time: form.start_time + ':00',
        end_time: form.end_time ? form.end_time + ':00' : null,
        late_threshold_minutes: form.late_threshold_minutes,
      };
      const url = editTarget ? `/api/shifts/${editTarget.id}` : '/api/shifts';
      const method = editTarget ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success(editTarget ? 'Shift updated' : 'Shift created');
      setShowForm(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(shift: Shift) {
    if (!confirm(`Delete shift "${shift.name}"? Staff assigned to it will revert to the default shift.`)) return;
    const res = await fetch(`/api/shifts/${shift.id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Shift deleted'); onRefresh(); }
    else toast.error('Delete failed');
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={openAdd}>
          <Plus className="w-4 h-4 mr-1" /> Add Shift
        </Button>
      </div>

      {shifts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
          No shift templates yet. Add one to assign custom times per staff member.
        </p>
      ) : (
        <div className="space-y-2">
          {shifts.map((shift) => (
            <div key={shift.id}
              className="flex items-center justify-between px-4 py-3 border rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <Clock className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-sm">{shift.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {shift.start_time.slice(0, 5)}
                    {shift.end_time ? ` – ${shift.end_time.slice(0, 5)}` : ''}
                    {' · '}
                    {shift.late_threshold_minutes}min grace
                  </p>
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0 ml-2">
                <Button size="icon" variant="ghost" onClick={() => openEdit(shift)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="text-destructive"
                  onClick={() => handleDelete(shift)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(v) => { if (!v) setShowForm(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Shift' : 'New Shift Template'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Shift Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Morning, Evening, Night"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Time *</Label>
                <Input type="time" value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div>
                <Label>End Time (optional)</Label>
                <Input type="time" value={form.end_time ?? ''}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Late Threshold (minutes)</Label>
              <Input
                type="number" min={0} max={120}
                value={form.late_threshold_minutes}
                onChange={(e) => setForm({ ...form, late_threshold_minutes: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Grace period after start time before marking as late
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editTarget ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

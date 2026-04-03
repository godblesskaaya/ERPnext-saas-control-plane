"use client";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createTenantSupportNote,
  loadTenantCurrentUser,
  loadTenantSupportNotes,
  toTenantDetailErrorMessage,
  updateTenantSupportNote,
} from "../../../../../domains/tenant-ops/application/tenantDetailUseCases";
import { TenantWorkspacePageLayout } from "../../../../../domains/tenant-ops/ui/tenant-detail/components/TenantWorkspacePageLayout";
import { useTenantRouteContext } from "../../../../../domains/tenant-ops/ui/tenant-detail/hooks/useTenantSectionData";
import type { SupportNote, UserProfile } from "../../../../../domains/shared/lib/types";

function formatTimestamp(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function TenantSupportPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { tenant, error } = useTenantRouteContext(id);

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [supportNotes, setSupportNotes] = useState<SupportNote[]>([]);
  const [supportNotesSupported, setSupportNotesSupported] = useState(true);
  const [supportNotesError, setSupportNotesError] = useState<string | null>(null);
  const [supportLoading, setSupportLoading] = useState(true);

  const [supportNoteCategory, setSupportNoteCategory] = useState("note");
  const [supportNoteText, setSupportNoteText] = useState("");
  const [supportNoteOwner, setSupportNoteOwner] = useState("");
  const [supportNoteContact, setSupportNoteContact] = useState("");
  const [supportNoteDueAt, setSupportNoteDueAt] = useState("");
  const [supportNoteStatus, setSupportNoteStatus] = useState("open");
  const [supportNoteFilter, setSupportNoteFilter] = useState("all");
  const [savingSupportNote, setSavingSupportNote] = useState(false);

  const isAdmin = currentUser?.role === "admin";

  const loadCurrentUser = useCallback(async () => {
    try {
      const user = await loadTenantCurrentUser();
      setCurrentUser(user);
    } catch {
      setCurrentUser(null);
    }
  }, []);

  const loadSupportNotesData = useCallback(async () => {
    if (!id || currentUser?.role !== "admin") {
      setSupportLoading(false);
      return;
    }

    setSupportLoading(true);
    try {
      const result = await loadTenantSupportNotes(id);
      if (!result.supported) {
        setSupportNotesSupported(false);
        setSupportNotes([]);
        setSupportNotesError(null);
        return;
      }
      setSupportNotesSupported(true);
      setSupportNotes(result.data);
      setSupportNotesError(null);
    } catch (err) {
      setSupportNotesError(toTenantDetailErrorMessage(err, "Failed to load support notes"));
    } finally {
      setSupportLoading(false);
    }
  }, [currentUser?.role, id]);

  useEffect(() => {
    void loadCurrentUser();
  }, [loadCurrentUser]);

  useEffect(() => {
    void loadSupportNotesData();
  }, [loadSupportNotesData]);

  const buildSupportNoteExtras = () => {
    const extras: { owner_name?: string; owner_contact?: string; sla_due_at?: string; status?: string } = {};
    if (supportNoteOwner.trim()) extras.owner_name = supportNoteOwner.trim();
    if (supportNoteContact.trim()) extras.owner_contact = supportNoteContact.trim();
    if (supportNoteDueAt) {
      const parsed = new Date(supportNoteDueAt);
      if (!Number.isNaN(parsed.getTime())) {
        extras.sla_due_at = parsed.toISOString();
      }
    }
    if (supportNoteStatus.trim()) {
      extras.status = supportNoteStatus.trim();
    }
    return extras;
  };

  const getSlaState = (note: SupportNote) => {
    if (note.sla_state) return note.sla_state;
    if (note.status === "resolved") return "resolved";
    if (!note.sla_due_at) return "unscheduled";
    const due = new Date(note.sla_due_at);
    if (Number.isNaN(due.getTime())) return "unscheduled";
    const now = new Date();
    if (due < now) return "breached";
    const diffHours = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (diffHours <= 24) return "due_soon";
    return "on_track";
  };

  const filteredSupportNotes = useMemo(() => {
    if (supportNoteFilter === "all") return supportNotes;
    if (["breached", "due_soon", "on_track", "unscheduled"].includes(supportNoteFilter)) {
      return supportNotes.filter((note) => getSlaState(note) === supportNoteFilter);
    }
    return supportNotes.filter((note) => (note.status ?? "open") === supportNoteFilter);
  }, [supportNoteFilter, supportNotes]);

  if (!id) {
    return <Alert severity="error">Tenant id is missing from route.</Alert>;
  }

  return (
    <TenantWorkspacePageLayout
      tenantId={id}
      title="Support notes"
      tenantContext={tenant ? `${tenant.company_name} (${tenant.domain})` : "Loading tenant context..."}
      footerError={error}
    >
      {!isAdmin ? (
        <Alert severity="warning">
          Support notes are visible to platform admins only.
        </Alert>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, borderColor: "divider", backgroundColor: "background.paper" }}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
              Support notes
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                void loadSupportNotesData();
              }}
              sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
            >
              Refresh
            </Button>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">Filter:</Typography>
            {["all", "open", "monitoring", "resolved", "due_soon", "breached"].map((option) => (
              <Button
                key={option}
                variant={supportNoteFilter === option ? "contained" : "outlined"}
                color={supportNoteFilter === option ? "success" : "inherit"}
                size="small"
                onClick={() => setSupportNoteFilter(option)}
                sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
              >
                {option.replace("_", " ")}
              </Button>
            ))}
          </Stack>

          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: "block" }}>
            Internal notes are visible to platform admins only. Use them to track incidents, billing context, or key follow-ups.
          </Typography>

          {supportLoading ? (
            <Alert severity="info">Loading support notes...</Alert>
          ) : !supportNotesSupported ? (
            <Alert severity="warning">Support notes are not available on this backend yet.</Alert>
          ) : supportNotesError ? (
            <Alert severity="error">{supportNotesError}</Alert>
          ) : (
            <Stack spacing={2}>
              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Add support note</Typography>
                  <Stack spacing={1} sx={{ mt: 1 }}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                      <TextField
                        select
                        size="small"
                        value={supportNoteCategory}
                        onChange={(event) => setSupportNoteCategory(event.target.value)}
                        SelectProps={{ native: true }}
                      >
                        <option value="note">Note</option>
                        <option value="incident">Incident</option>
                        <option value="follow_up">Follow-up</option>
                        <option value="billing">Billing</option>
                      </TextField>
                      <TextField
                        select
                        size="small"
                        value={supportNoteStatus}
                        onChange={(event) => setSupportNoteStatus(event.target.value)}
                        SelectProps={{ native: true }}
                      >
                        {["open", "monitoring", "resolved"].map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </TextField>
                      <TextField
                        size="small"
                        placeholder="Owner name"
                        value={supportNoteOwner}
                        onChange={(event) => setSupportNoteOwner(event.target.value)}
                      />
                      <TextField
                        size="small"
                        placeholder="Contact (phone/WhatsApp/email)"
                        value={supportNoteContact}
                        onChange={(event) => setSupportNoteContact(event.target.value)}
                      />
                      <TextField
                        size="small"
                        type="datetime-local"
                        value={supportNoteDueAt}
                        onChange={(event) => setSupportNoteDueAt(event.target.value)}
                      />
                      <Button
                        variant="outlined"
                        color="success"
                        disabled={savingSupportNote || !supportNoteText.trim()}
                        onClick={async () => {
                          if (!id) return;
                          setSavingSupportNote(true);
                          setSupportNotesError(null);
                          try {
                            const result = await createTenantSupportNote(
                              id,
                              supportNoteCategory,
                              supportNoteText.trim(),
                              buildSupportNoteExtras()
                            );
                            if (!result.supported) {
                              setSupportNotesError("Support note endpoint is not available on this backend.");
                              return;
                            }
                            setSupportNoteText("");
                            await loadSupportNotesData();
                          } catch (err) {
                            setSupportNotesError(toTenantDetailErrorMessage(err, "Failed to save note"));
                          } finally {
                            setSavingSupportNote(false);
                          }
                        }}
                        sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                      >
                        {savingSupportNote ? "Saving..." : "Save note"}
                      </Button>
                    </Stack>
                    <TextField
                      multiline
                      minRows={4}
                      fullWidth
                      placeholder="Record the support context, decisions, and next steps."
                      value={supportNoteText}
                      onChange={(event) => setSupportNoteText(event.target.value)}
                    />
                  </Stack>
                </CardContent>
              </Card>

              <Stack spacing={1.5}>
                {filteredSupportNotes.length === 0 ? (
                  <Alert severity="info">No support notes yet.</Alert>
                ) : (
                  filteredSupportNotes.map((note) => (
                    <Card key={note.id} variant="outlined" sx={{ borderRadius: 3 }}>
                      <CardContent sx={{ p: 2 }}>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }} justifyContent="space-between">
                          <Chip label={note.category} size="small" variant="outlined" />
                          <Typography variant="caption" color="text.secondary">{formatTimestamp(note.created_at)}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                          <Typography variant="caption" color="text.secondary">Status: {note.status ?? "open"}</Typography>
                          <Chip size="small" variant="outlined" label={`SLA: ${getSlaState(note).replace("_", " ")}`} />
                        </Stack>
                        <Typography variant="body2" sx={{ mt: 1.5, color: "text.primary" }}>{note.note}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                          Owner: {note.owner_name || "—"} {note.owner_contact ? `• ${note.owner_contact}` : ""}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                          SLA due: {note.sla_due_at ? formatTimestamp(note.sla_due_at) : "—"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                          {note.author_email || note.author_role || "admin"} • {note.author_role}
                        </Typography>
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                          <Button
                            variant="outlined"
                            size="small"
                            disabled={savingSupportNote}
                            onClick={async () => {
                              if (!note.id) return;
                              setSavingSupportNote(true);
                              try {
                                const result = await updateTenantSupportNote(note.id, {
                                  status: note.status === "resolved" ? "open" : "resolved",
                                });
                                if (!result.supported) {
                                  setSupportNotesSupported(false);
                                  return;
                                }
                                await loadSupportNotesData();
                              } catch (err) {
                                setSupportNotesError(toTenantDetailErrorMessage(err, "Failed to update support note"));
                              } finally {
                                setSavingSupportNote(false);
                              }
                            }}
                            sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                          >
                            {note.status === "resolved" ? "Reopen" : "Mark resolved"}
                          </Button>
                        </Stack>
                      </CardContent>
                    </Card>
                  ))
                )}
              </Stack>
            </Stack>
          )}
        </Paper>
      )}

    </TenantWorkspacePageLayout>
  );
}

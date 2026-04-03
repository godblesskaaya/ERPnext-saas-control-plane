"use client";

import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";

import {
  inviteTenantMember,
  removeTenantMember,
  toTenantDetailErrorMessage,
  updateTenantMemberRole,
} from "../../../../../domains/tenant-ops/application/tenantDetailUseCases";
import { TenantWorkspacePageLayout } from "../../../../../domains/tenant-ops/ui/tenant-detail/components/TenantWorkspacePageLayout";
import {
  tenantDetailQueryKeys,
  useTenantMembersData,
  useTenantRouteContext,
} from "../../../../../domains/tenant-ops/ui/tenant-detail/hooks/useTenantSectionData";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const memberRoles = ["owner", "admin", "billing", "technical"];

function formatTimestamp(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function TenantMembersPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { tenant, error } = useTenantRouteContext(id);
  const queryClient = useQueryClient();
  const { members, membersSupported, membersError: membersQueryError, membersLoading, refresh } = useTenantMembersData(id);

  const [membersActionError, setMembersActionError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("admin");
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  const invalidateMembersAndRoute = useCallback(async () => {
    if (!id) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: tenantDetailQueryKeys.members(id) }),
      queryClient.invalidateQueries({ queryKey: tenantDetailQueryKeys.tenant(id) }),
    ]);
    await refresh();
  }, [id, queryClient, refresh]);

  const inviteMutation = useMutation({
    mutationFn: async (payload: { email: string; role: string }) => inviteTenantMember(id!, payload),
    onSuccess: async (result) => {
      if (!result.supported) {
        setMembersActionError("Team invitation endpoint is not available on this backend.");
        return;
      }
      setInviteEmail("");
      await invalidateMembersAndRoute();
    },
    onError: (err) => {
      setMembersActionError(toTenantDetailErrorMessage(err, "Failed to invite member"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { memberId: string; role: string }) =>
      updateTenantMemberRole(id!, payload.memberId, payload.role),
    onSuccess: async (result) => {
      if (!result.supported) {
        setMembersActionError("Member update endpoint is not available on this backend.");
        return;
      }
      await invalidateMembersAndRoute();
    },
    onError: (err) => {
      setMembersActionError(toTenantDetailErrorMessage(err, "Failed to update member role"));
    },
    onSettled: () => setUpdatingMemberId(null),
  });

  const removeMutation = useMutation({
    mutationFn: async (memberId: string) => removeTenantMember(id!, memberId),
    onSuccess: async (result) => {
      if (!result.supported) {
        setMembersActionError("Member removal endpoint is not available on this backend.");
        return;
      }
      await invalidateMembersAndRoute();
    },
    onError: (err) => {
      setMembersActionError(toTenantDetailErrorMessage(err, "Failed to remove member"));
    },
    onSettled: () => setRemovingMemberId(null),
  });

  const membersError = membersActionError ?? membersQueryError;

  if (!id) {
    return <Alert severity="error">Tenant id is missing from route.</Alert>;
  }

  return (
    <TenantWorkspacePageLayout
      tenantId={id}
      title="Team members"
      tenantContext={tenant ? `${tenant.company_name} (${tenant.domain})` : "Loading tenant context..."}
      footerError={error}
    >
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, borderColor: "divider", backgroundColor: "background.paper" }}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
            Team
          </Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              void refresh();
            }}
            sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
          >
            Refresh
          </Button>
        </Stack>

        {membersLoading ? (
          <Alert severity="info">Loading team members...</Alert>
        ) : !membersSupported ? (
          <Alert severity="warning">Team management is not available on this backend yet.</Alert>
        ) : membersError ? (
          <Alert severity="error">{membersError}</Alert>
        ) : (
          <Stack spacing={2}>
            <Card variant="outlined" sx={{ borderRadius: 3 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Invite teammate
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1 }}>
                  <TextField
                    placeholder="Email address"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    select
                    size="small"
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value)}
                    SelectProps={{ native: true }}
                  >
                    {memberRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </TextField>
                  <Button
                    variant="outlined"
                    color="success"
                    disabled={inviteMutation.isPending || !inviteEmail.trim()}
                    onClick={async () => {
                      if (!id) return;
                      setMembersActionError(null);
                      try {
                        await inviteMutation.mutateAsync({
                          email: inviteEmail.trim(),
                          role: inviteRole,
                        });
                      } catch {
                        // handled via mutation onError
                      }
                    }}
                    sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                  >
                    {inviteMutation.isPending ? "Inviting..." : "Invite"}
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
              <Table size="small">
                <TableHead sx={{ backgroundColor: "grey.50" }}>
                  <TableRow>
                    <TableCell>Email</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Joined</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {members.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Typography variant="body2" color="text.secondary">
                          No team members yet.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    members.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>{member.user_email || member.user_id}</TableCell>
                        <TableCell>
                          {member.role === "owner" ? (
                            <Chip label="owner" size="small" variant="outlined" />
                          ) : (
                            <TextField
                              select
                              size="small"
                              value={member.role}
                              onChange={async (event) => {
                                if (!id) return;
                                const nextRole = event.target.value;
                                setUpdatingMemberId(member.id);
                                setMembersActionError(null);
                                try {
                                  await updateMutation.mutateAsync({ memberId: member.id, role: nextRole });
                                } catch {
                                  // handled via mutation onError
                                }
                              }}
                              disabled={updatingMemberId === member.id}
                              SelectProps={{ native: true }}
                            >
                              {memberRoles.map((role) => (
                                <option key={role} value={role}>
                                  {role}
                                </option>
                              ))}
                            </TextField>
                          )}
                        </TableCell>
                        <TableCell>{formatTimestamp(member.created_at)}</TableCell>
                        <TableCell>
                          {member.role === "owner" ? (
                            <Typography variant="caption" color="text.secondary">
                              Owner
                            </Typography>
                          ) : (
                            <Button
                              variant="outlined"
                              color="error"
                              size="small"
                              disabled={removingMemberId === member.id}
                              onClick={async () => {
                                if (!id) return;
                                setRemovingMemberId(member.id);
                                setMembersActionError(null);
                                try {
                                  await removeMutation.mutateAsync(member.id);
                                } catch {
                                  // handled via mutation onError
                                }
                              }}
                              sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                            >
                              {removingMemberId === member.id ? "Removing..." : "Remove"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        )}
      </Paper>

    </TenantWorkspacePageLayout>
  );
}

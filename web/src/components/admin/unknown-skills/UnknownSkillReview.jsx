
import { useState } from "react";

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";

import useSearchSkills from "../../../hooks/useSearchSkills";
import useResolveUnknownSkill from "../../../hooks/useResolveUnknownSkill";

const UnknownSkillReview = ({ open, skill, onClose }) => {
  const [action, setAction] = useState("link");
  const [search, setSearch] = useState("");
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [canonicalName, setCanonicalName] = useState("");
  const [reason, setReason] = useState("");
const [confidence, setConfidence] = useState(
  skill?.confidence != null ? String(skill.confidence) : ""
);
  const searchQuery = useSearchSkills(search);
  const resolveMutation = useResolveUnknownSkill();

  if (!skill) return null;

  const candidateName = [
    skill.candidate?.firstName,
    skill.candidate?.lastName,
  ]
    .filter(Boolean)
    .join(" ");

  const isValidConfidence =
    confidence.trim() !== "" &&
    Number.isFinite(Number(confidence)) &&
    Number(confidence) >= 0 &&
    Number(confidence) <= 1;

  const canSubmit =
    isValidConfidence &&
    (action === "link"
      ? Boolean(selectedSkillId)
      : action === "add"
        ? Boolean(canonicalName.trim())
        : true) &&
    !resolveMutation.isPending;

  const handleActionChange = (event) => {
    setAction(event.target.value);
    setSelectedSkillId("");
    setSearch("");
    setCanonicalName(skill.skillName || "");
  };

  const handleSubmit = () => {
    const payload = {
      action,
      confidence: Number(confidence),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    };

    if (action === "link") {
      payload.skillId = Number(selectedSkillId);
    }

    if (action === "add") {
      payload.canonicalName = canonicalName.trim();
    }

    resolveMutation.mutate(
      { id: skill.id, payload },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog
      open={open}
      onClose={resolveMutation.isPending ? undefined : onClose}
      fullWidth
      maxWidth="md"
    >
      <DialogTitle>Review Unknown Skill</DialogTitle>

      <DialogContent dividers>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Unknown Skill
            </Typography>
            <Typography variant="h6" fontWeight={600}>
              {skill.skillName}
            </Typography>
            <Typography color="text.secondary">
              Status: {skill.status}
            </Typography>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Candidate
            </Typography>
            <Typography>
              {candidateName || "Unnamed Candidate"}
            </Typography>
            <Typography color="text.secondary">
              {skill.candidate?.email || "-"}
            </Typography>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Source File
            </Typography>
            <Typography>
              {skill.sourceFile?.originalFilename || "-"}
            </Typography>
            <Typography color="text.secondary">
              Source: {skill.sourceFile?.sourceType || "-"}
            </Typography>
            <Typography color="text.secondary">
              Uploaded: {skill.sourceFile?.uploadedAt
                ? new Date(skill.sourceFile.uploadedAt).toLocaleDateString()
                : "-"}
            </Typography>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Evidence
            </Typography>
            <Typography sx={{ whiteSpace: "pre-wrap" }}>
              {skill.evidence || "No evidence available."}
            </Typography>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Original Confidence
            </Typography>
            <Typography>
              {typeof skill.confidence === "number"
                ? `${(skill.confidence * 100).toFixed(1)}%`
                : "-"}
            </Typography>
          </Box>

          <Divider />

          <Typography variant="h6">Resolution</Typography>

          <TextField
            select
            fullWidth
            size="small"
            label="Choose Action"
            value={action}
            onChange={handleActionChange}
          >
            <MenuItem value="link">Link to Existing Skill</MenuItem>
            <MenuItem value="add">Add New Skill</MenuItem>
            <MenuItem value="reject">Reject Skill</MenuItem>
          </TextField>

          {action === "link" && (
            <Box>
              <TextField
                fullWidth
                size="small"
                label="Search Existing Skills"
                placeholder="Type a skill name..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSelectedSkillId("");
                }}
              />

              {searchQuery.isFetching && (
                <CircularProgress size={20} sx={{ mt: 1 }} />
              )}

              {searchQuery.isError && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  Failed to search skills.
                </Alert>
              )}

              {searchQuery.data?.items?.map((item) => (
                <Button
                  key={item.id}
                  fullWidth
                  variant={
                    selectedSkillId === String(item.id)
                      ? "contained"
                      : "outlined"
                  }
                  onClick={() => setSelectedSkillId(String(item.id))}
                  sx={{ mt: 1, justifyContent: "space-between" }}
                >
                  {item.canonicalName}
                  {` ${(item.similarity * 100).toFixed(0)}%`}
                </Button>
              ))}

              {search.trim() &&
                !searchQuery.isFetching &&
                searchQuery.data?.items?.length === 0 && (
                  <Typography color="text.secondary" sx={{ mt: 1 }}>
                    No matching skills found.
                  </Typography>
                )}
            </Box>
          )}

          {action === "add" && (
            <TextField
              fullWidth
              size="small"
              label="Canonical Skill Name"
              value={canonicalName}
              onChange={(event) => setCanonicalName(event.target.value)}
            />
          )}

          <TextField
            fullWidth
            size="small"
            type="number"
            label="Review Confidence (0-1)"
            value={confidence}
            onChange={(event) => setConfidence(event.target.value)}
            inputProps={{ min: 0, max: 1, step: 0.01 }}
            error={confidence !== "" && !isValidConfidence}
            helperText="Required. Enter a value between 0 and 1."
          />

          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Reason (Optional)"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />

          {resolveMutation.isError && (
            <Alert severity="error">
              {resolveMutation.error?.response?.data?.message ||
                "Failed to resolve unknown skill. Please try again."}
            </Alert>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button
          onClick={onClose}
          disabled={resolveMutation.isPending}
          color="secondary"
        >
          Cancel
        </Button>

        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {resolveMutation.isPending ? (
            <CircularProgress size={22} color="inherit" />
          ) : (
            "Submit Review"
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default UnknownSkillReview;

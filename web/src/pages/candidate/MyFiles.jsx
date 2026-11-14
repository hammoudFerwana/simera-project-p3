
import { useRef, useState } from "react";

import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Button,
} from "@mui/material";

import useUpload, {
  getUploadErrorMessage,
} from "../../hooks/useUpload";

import useCandidateFiles from "../../hooks/useCandidateFiles";

import { uploadFileSchema } from "../../validation/uploadRules";

import UploadCard from "../../components/files/UploadCard";
import FilesTable from "../../components/files/FilesTable";

export default function MyFiles() {
  // Selected files
  const [cvFile, setCvFile] = useState(null);
  const [linkedinFile, setLinkedinFile] = useState(null);

  // Upload messages
  const [cvError, setCvError] = useState("");
  const [linkedinError, setLinkedinError] = useState("");

  const [cvSuccess, setCvSuccess] = useState("");
  const [linkedinSuccess, setLinkedinSuccess] = useState("");

  // File input references
  const cvInputRef = useRef(null);
  const linkedinInputRef = useRef(null);

  // Upload mutations
  const cvUpload = useUpload("cv");
  const linkedinUpload = useUpload("linkedin");

  // Candidate files query
  const {
    data: files = [],
    isLoading,
    isError,
    refetch,
  } = useCandidateFiles();

  // Validate selected file
  const validateFile = (file, type) => {
    try {
      uploadFileSchema(type).validateSync(file);
      return "";
    } catch (error) {
      return error.message;
    }
  };

  // Handle file selection
  const handleFileChange = (event, type) => {
    const file = event.target.files[0];

    if (!file) return;

    const error = validateFile(file, type);

    if (type === "cv") {
      setCvError(error);
      setCvSuccess("");
      cvUpload.reset();
      setCvFile(error ? null : file);
    } else {
      setLinkedinError(error);
      setLinkedinSuccess("");
      linkedinUpload.reset();
      setLinkedinFile(error ? null : file);
    }

    // Allow selecting the same file again
    event.target.value = "";
  };

  // Handle upload
  const handleUpload = (type) => {
    const isCv = type === "cv";

    const file = isCv ? cvFile : linkedinFile;
    const upload = isCv ? cvUpload : linkedinUpload;

    if (!file) return;

    if (isCv) {
      setCvError("");
      setCvSuccess("");
    } else {
      setLinkedinError("");
      setLinkedinSuccess("");
    }

    upload.mutate(file, {
      onSuccess: (response) => {
        if (isCv) {
          setCvSuccess(
            response.message || "File received successfully."
          );
        } else {
          setLinkedinSuccess(
            response.message || "File received successfully."
          );
        }
      },

      onError: (error) => {
        const message = getUploadErrorMessage(error);

        if (isCv) {
          setCvError(message);
        } else {
          setLinkedinError(message);
        }
      },
    });
  };

  return (
    <Box sx={{ maxWidth: 1000, mx: "auto" }}>
      {/* Page Header */}
{/* Page Header */}
<Box sx={{ mb: 4 }}>
  <Typography
    variant="h4"
    sx={{
      fontWeight: 800,
      color: "primary.main",
      letterSpacing: "-0.8px",
      fontSize: { xs: "1.8rem", md: "2.2rem" },
      lineHeight: 1.3,
      mb: 1,
    }}
  >
    My Files
  </Typography>

  <Typography
    variant="body1"
    sx={{
      maxWidth: 600,
      lineHeight: 1.5,
      color: "text.secondary",
      opacity: 0.8,
    }}
  >
    Manage your uploaded CV and LinkedIn profile.
    Track your file processing status and upload updated versions when needed.
  </Typography>
</Box>
      <UploadCardNotice />

      {/* Upload Cards */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: 3,
        }}
      >
        <UploadCard
          type="cv"
          title="CV / Resume"
          description="Upload your latest resume."
          file={cvFile}
          error={cvError}
          success={cvSuccess}
          inputRef={cvInputRef}
          onFileChange={(event) => handleFileChange(event, "cv")}
          onUpload={() => handleUpload("cv")}
          isPending={cvUpload.isPending}
          accept=".pdf,.docx"
          formats="PDF, DOCX"
        />

        <UploadCard
          type="linkedin"
          title="LinkedIn Profile"
          description="Upload your LinkedIn profile export."
          file={linkedinFile}
          error={linkedinError}
          success={linkedinSuccess}
          inputRef={linkedinInputRef}
          onFileChange={(event) => handleFileChange(event, "linkedin")}
          onUpload={() => handleUpload("linkedin")}
          isPending={linkedinUpload.isPending}
          accept=".md"
          formats="MD"
        />
      </Box>

      {/* Uploaded Files */}
      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : isError ? (
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => refetch()}
            >
              Retry
            </Button>
          }
          sx={{ mt: 4 }}
        >
          Failed to load your uploaded files.
        </Alert>
      ) : (
        <FilesTable files={files} />
      )}
    </Box>
  );
}

function UploadCardNotice() {
  return (
    <Box sx={{ mb: 4 }}>
      <Typography
        component="div"
        sx={{
          p: 2,
          borderRadius: 2,
          bgcolor: "info.light",
          color: "info.dark",
        }}
      >
        Files must be in English. The email address inside your submitted
        document must match your active login email.
      </Typography>
    </Box>
  );
}

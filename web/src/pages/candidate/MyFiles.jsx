
import { useRef, useState } from 'react';

import {
  Box,
  Typography,
} from '@mui/material';

import useUpload, {
  getUploadErrorMessage,
} from '../../hooks/useUpload';

import { uploadFileSchema } from '../../validation/uploadRules';

import UploadCard from '../../components/files/UploadCard';

export default function MyFiles() {
  // Selected files
  const [cvFile, setCvFile] = useState(null);
  const [linkedinFile, setLinkedinFile] = useState(null);

  // Error and success messages
  const [cvError, setCvError] = useState('');
  const [linkedinError, setLinkedinError] = useState('');

  const [cvSuccess, setCvSuccess] = useState('');
  const [linkedinSuccess, setLinkedinSuccess] = useState('');

  // File input references
  const cvInputRef = useRef(null);
  const linkedinInputRef = useRef(null);

  // Upload mutations
  const cvUpload = useUpload('cv');
  const linkedinUpload = useUpload('linkedin');

  // Validate selected file using Yup
  const validateFile = (file, type) => {
    try {
      uploadFileSchema(type).validateSync(file);
      return '';
    } catch (error) {
      return error.message;
    }
  };

  // Handle file selection
  const handleFileChange = (event, type) => {
    const file = event.target.files[0];

    if (!file) return;

    const error = validateFile(file, type);

    if (type === 'cv') {
      setCvError(error);
      setCvSuccess('');
      cvUpload.reset();
      setCvFile(error ? null : file);
    } else {
      setLinkedinError(error);
      setLinkedinSuccess('');
      linkedinUpload.reset();
      setLinkedinFile(error ? null : file);
    }

    // Allow selecting the same file again
    event.target.value = '';
  };

  // Upload selected file
  const handleUpload = async (type) => {
    const file = type === 'cv' ? cvFile : linkedinFile;

    if (!file) return;

    try {
      if (type === 'cv') {
        setCvError('');
        setCvSuccess('');

        const response = await cvUpload.mutateAsync(file);

        setCvSuccess(response.message || 'File received successfully.');
      } else {
        setLinkedinError('');
        setLinkedinSuccess('');

        const response = await linkedinUpload.mutateAsync(file);

        setLinkedinSuccess(response.message || 'File received successfully.');
      }
    } catch (error) {
      const message = getUploadErrorMessage(error);

      if (type === 'cv') {
        setCvError(message);
      } else {
        setLinkedinError(message);
      }
    }
  };

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
      {/* Page Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          My Files
        </Typography>

        <Typography color="text.secondary">
          Upload your CV and LinkedIn profile. Each box accepts one file at a
          time.
        </Typography>
      </Box>

      {/* Important Notice */}
      <UploadCardNotice />

      {/* Upload Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
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
          onFileChange={(event) => handleFileChange(event, 'cv')}
          onUpload={() => handleUpload('cv')}
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
          onFileChange={(event) => handleFileChange(event, 'linkedin')}
          onUpload={() => handleUpload('linkedin')}
          isPending={linkedinUpload.isPending}
          accept=".md"
          formats="MD"
        />
      </Box>
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
          bgcolor: 'info.light',
          color: 'info.dark',
        }}
      >
        Files must be in English. The email address inside your submitted
        document must match your active login email.
      </Typography>
    </Box>
  );
}

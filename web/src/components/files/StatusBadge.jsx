
import { Chip } from "@mui/material";

import { FILE_STATUS } from "../../constants/fileStatus";

const STATUS_CONFIG = {
  [FILE_STATUS.PROCESSING]: {
    label: "Processing",
    color: "info",
  },

  [FILE_STATUS.COMPLETED]: {
    label: "Completed",
    color: "success",
  },

  [FILE_STATUS.FAILED]: {
    label: "Failed",
    color: "error",
  },
};

export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status];

  if (!config) {
    return (
      <Chip
        label="Unknown"
        size="small"
        variant="outlined"
      />
    );
  }

  return (
    <Chip
      label={config.label}
      color={config.color}
      size="small"
      variant="outlined"
    />
  );
}

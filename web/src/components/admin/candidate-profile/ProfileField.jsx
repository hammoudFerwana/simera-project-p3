
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Typography,
} from "@mui/material";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import FieldMetadata from "./FieldMetadata";
import { formatValue } from "../../../utils/candidateProfile";

export default function ProfileField({ label, field }) {
  if (field === null || field === undefined) {
    return null;
  }

  const isFieldView =
    typeof field === "object" &&
    !Array.isArray(field) &&
    Object.prototype.hasOwnProperty.call(field, "value");

  const value = isFieldView ? field.value : field;

  return (
    <Accordion
      disableGutters
      elevation={0}
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "8px !important",
        "&:before": { display: "none" },
        mb: 1.5,
        overflow: "hidden",
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          px: 2,
          minHeight: 64,
          "& .MuiAccordionSummary-content": {
            my: 1.5,
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
          },
        }}
      >
        <Typography variant="body2" fontWeight={700}>
          {label}
        </Typography>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            textAlign: "right",
            overflowWrap: "anywhere",
            whiteSpace: "pre-wrap",
          }}
        >
          {formatValue(value)}
        </Typography>
      </AccordionSummary>

      {isFieldView && (
        <AccordionDetails
          sx={{
            px: 2,
            pt: 0,
            pb: 2,
            bgcolor: "background.default",
          }}
        >
          <FieldMetadata field={field} />
        </AccordionDetails>
      )}
    </Accordion>
  );
}


import * as yup from "yup";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const uploadFileSchema = (type) => {
  const allowedExtensions =
    type === "cv" ? ["pdf", "docx"] : ["md"];

  const allowedFormats =
    type === "cv" ? "PDF or DOCX" : "MD";

  return yup
    .mixed()
    .required("Please select a file.")

    // Check if the file is empty
    .test(
      "file-not-empty",
      "The selected file is empty.",
      (file) => !file || file.size > 0
    )

    // Check file extension
    .test(
      "file-format",
      `Please select a ${allowedFormats} file.`,
      (file) => {
        if (!file) return true;

        const extension = file.name
          .split(".")
          .pop()
          .toLowerCase();

        return allowedExtensions.includes(extension);
      }
    )

    // Check file size
    .test(
      "file-size",
      "File size must not exceed 10 MB.",
      (file) => !file || file.size <= MAX_FILE_SIZE
    );
};

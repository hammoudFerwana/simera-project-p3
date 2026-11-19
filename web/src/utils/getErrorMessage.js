const getErrorMessage = (error, fallback = 'Something went wrong.') => {
  const errors = error?.response?.data?.errors;

  if (typeof errors === 'string') {
    return errors;
  }

  if (errors && typeof errors === 'object') {
    return Object.values(errors).join(' ');
  }

  return error?.response?.data?.message || error?.message || fallback;
};

export default getErrorMessage;

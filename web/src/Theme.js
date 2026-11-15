
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'light',

    primary: {
      main: '#2563EB',
    },

    secondary: {
      main: '#64748B',
    },

    background: {
      default: '#F8FAFC',
      paper: '#FFFFFF',
    },


sidebar: {
  main: "#172554",
  contrastText: "#FFFFFF",
  active: "rgba(59, 130, 246, 0.18)",
  activeText: "#60A5FA",
  text: "#CBD5E1",
  hover: "rgba(255, 255, 255, 0.08)",
  divider: "rgba(255, 255, 255, 0.12)",
},

  },

  typography: {
    fontFamily: 'Roboto, Arial, sans-serif',
  },

  shape: {
    borderRadius: 8,
  },
});

export default theme;

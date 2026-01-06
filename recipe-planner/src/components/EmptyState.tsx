import { Typography } from "@mui/material";

interface EmptyStateProps {
  message: string;
}

export function EmptyState({ message }: EmptyStateProps) {
  return <Typography color="text.secondary">{message}</Typography>;
}

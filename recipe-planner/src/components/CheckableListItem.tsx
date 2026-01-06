import { ListItem, ListItemIcon, ListItemText, Checkbox } from "@mui/material";

interface CheckableListItemProps {
  itemKey: string;
  checked: boolean;
  onToggle: (key: string) => void;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  disablePadding?: boolean;
}

export function CheckableListItem({
  itemKey,
  checked,
  onToggle,
  primary,
  secondary,
  disablePadding = false,
}: CheckableListItemProps) {
  return (
    <ListItem disablePadding={disablePadding}>
      <ListItemIcon sx={{ minWidth: 36 }}>
        <Checkbox
          edge="start"
          checked={checked}
          onChange={() => onToggle(itemKey)}
          size="small"
        />
      </ListItemIcon>
      <ListItemText
        primary={
          <span
            style={{
              textDecoration: checked ? "line-through" : "none",
            }}
          >
            {primary}
          </span>
        }
        secondary={secondary}
      />
    </ListItem>
  );
}

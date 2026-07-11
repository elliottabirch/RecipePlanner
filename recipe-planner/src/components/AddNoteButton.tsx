// One-tap "Add note" affordance (IMP-05, D-09; 06-UI-SPEC §Component Inventory
// item 4). A single shared control reused verbatim on the three note-capture
// surfaces (recipe card, cook-mode Now/Next card, calendar cell) so provenance
// tagging + touch-target sizing stay consistent. Tap the ≥44px IconButton →
// a compact Popover with a TextField + "Save note" → writes a pending
// recipe_notes row via useRecipeNotes().addNote. No page navigation.
import { useState } from "react";
import {
  IconButton,
  Tooltip,
  Popover,
  Box,
  TextField,
  Button,
} from "@mui/material";
import { NoteAdd as NoteAddIcon } from "@mui/icons-material";
import { useRecipeNotes } from "../hooks/useRecipeNotes";
import type { RecipeNote } from "../lib/types";

type SourceSurface = NonNullable<RecipeNote["source_surface"]>;

export interface AddNoteButtonProps {
  recipeId: string;
  sourceSurface: SourceSurface;
  size?: "small" | "medium";
}

export default function AddNoteButton({
  recipeId,
  sourceSurface,
  size = "medium",
}: AddNoteButtonProps) {
  const { addNote } = useRecipeNotes();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const open = Boolean(anchorEl);

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setText("");
  };

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await addNote(recipeId, trimmed, sourceSurface);
      handleClose();
    } catch (err) {
      console.error("Failed to save note:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Tooltip title="Add note">
        <IconButton
          size={size}
          onClick={handleOpen}
          aria-label="Add note"
          sx={{ minWidth: 44, minHeight: 44 }}
        >
          <NoteAddIcon fontSize={size === "small" ? "small" : "medium"} />
        </IconButton>
      </Tooltip>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        onClick={(e) => e.stopPropagation()}
      >
        <Box sx={{ p: 2, width: 280, display: "flex", flexDirection: "column", gap: 1 }}>
          <TextField
            autoFocus
            multiline
            minRows={2}
            placeholder="Add a note…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            size="small"
            fullWidth
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSave();
              }
            }}
          />
          <Box display="flex" justifyContent="flex-end" gap={1}>
            <Button size="small" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleSave}
              disabled={!text.trim() || saving}
            >
              Save note
            </Button>
          </Box>
        </Box>
      </Popover>
    </>
  );
}

"use client";

import Link from "next/link";
import { Box, Divider, List, ListItemButton, ListItemText, Paper, Stack, Typography } from "@mui/material";

import { isShellNavItemActive, type ShellNavSection } from "../model/nav";

type WorkspaceSidebarTone = "light" | "dark";

type WorkspaceSidebarProps = {
  overline: string;
  title: string;
  caption?: string;
  sections: ShellNavSection[];
  pathname: string;
  tone?: WorkspaceSidebarTone;
};

function toneStyles(tone: WorkspaceSidebarTone) {
  if (tone === "dark") {
    return {
      paper: {
        borderColor: "rgba(100,116,139,0.4)",
        bgcolor: "rgba(2,6,23,0.92)",
        color: "grey.100",
      },
      divider: { borderColor: "rgba(148,163,184,0.28)" },
      overline: { color: "warning.light" },
      title: { color: "common.white" },
      caption: { color: "grey.400" },
      sectionTitle: { color: "grey.400" },
      sectionDescription: { color: "grey.500" },
      item: {
        borderColor: "rgba(100,116,139,0.4)",
        bgcolor: "rgba(15,23,42,0.75)",
        hoverBg: "rgba(51,65,85,0.75)",
      },
      itemActive: {
        borderColor: "warning.main",
        bgcolor: "rgba(245,158,11,0.14)",
      },
      itemPrimary: { color: "grey.100" },
      itemPrimaryActive: { color: "warning.light" },
      itemSecondary: { color: "grey.500" },
    };
  }

  return {
    paper: {
      borderColor: "divider",
      bgcolor: "rgba(255,255,255,0.88)",
      color: "text.primary",
    },
    divider: {},
    overline: { color: "primary.main" },
    title: {},
    caption: { color: "text.secondary" },
    sectionTitle: { color: "text.secondary" },
    sectionDescription: { color: "text.secondary" },
    item: {
      borderColor: "divider",
      bgcolor: "background.paper",
      hoverBg: "rgba(245,158,11,0.1)",
    },
    itemActive: {
      borderColor: "primary.light",
      bgcolor: "rgba(13,106,106,0.08)",
    },
    itemPrimary: { color: "text.primary" },
    itemPrimaryActive: { color: "primary.main" },
    itemSecondary: { color: "text.secondary" },
  };
}

export function WorkspaceSidebar({ overline, title, caption, sections, pathname, tone = "light" }: WorkspaceSidebarProps) {
  const styles = toneStyles(tone);

  return (
    <Paper
      component="aside"
      elevation={1}
      sx={{
        position: "sticky",
        top: 96,
        alignSelf: "flex-start",
        p: 2.25,
        borderRadius: 3,
        border: "1px solid",
        ...styles.paper,
      }}
    >
      <Stack spacing={2}>
        <Box>
          <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 0.7, ...styles.overline }}>
            {overline}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, ...styles.title }}>
            {title}
          </Typography>
          {caption ? (
            <Typography variant="caption" sx={styles.caption}>
              {caption}
            </Typography>
          ) : null}
        </Box>

        <Divider sx={styles.divider} />

        {sections.map((section) => (
          <Box key={section.title}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", ...styles.sectionTitle }}>
              {section.title}
            </Typography>
            {section.description ? (
              <Typography variant="caption" display="block" sx={{ mb: 1, ...styles.sectionDescription }}>
                {section.description}
              </Typography>
            ) : null}
            <List dense disablePadding>
              {section.items.map((item) => {
                const active = isShellNavItemActive(pathname, item);
                return (
                  <ListItemButton
                    key={item.href}
                    component={Link}
                    href={item.href}
                    selected={active}
                    sx={{
                      borderRadius: 2,
                      mb: 0.5,
                      border: "1px solid",
                      borderColor: active ? styles.itemActive.borderColor : styles.item.borderColor,
                      bgcolor: active ? styles.itemActive.bgcolor : styles.item.bgcolor,
                      "&:hover": { bgcolor: styles.item.hoverBg },
                    }}
                  >
                    <ListItemText
                      primary={item.label}
                      secondary={item.hint}
                      primaryTypographyProps={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: active ? styles.itemPrimaryActive.color : styles.itemPrimary.color,
                      }}
                      secondaryTypographyProps={{ fontSize: 11.5, ...styles.itemSecondary }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}

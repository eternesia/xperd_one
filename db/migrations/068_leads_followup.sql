-- Prospek dari form xperd.id/contact (tabel leads) kini bisa ditindaklanjuti superadmin.
-- Status: new → contacted → qualified → won / lost (spam untuk isian sampah).
ALTER TABLE leads
  ADD COLUMN notes text NULL AFTER message,
  ADD COLUMN next_follow_up date NULL AFTER notes,
  ADD COLUMN last_contacted_at datetime(6) NULL AFTER next_follow_up,
  ADD COLUMN handled_by char(36) NULL AFTER last_contacted_at,
  ADD KEY ix_leads_status (status, created_at);

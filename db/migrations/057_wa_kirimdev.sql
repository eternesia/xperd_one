-- Provider WhatsApp resmi Kirimdev (WhatsApp Cloud API): Phone Number ID dan template invoice per workspace.
ALTER TABLE crm_wa_settings
  ADD COLUMN phone_number_id VARCHAR(60) NULL,
  ADD COLUMN invoice_template VARCHAR(100) NULL,
  ADD COLUMN template_lang VARCHAR(12) NOT NULL DEFAULT 'id';

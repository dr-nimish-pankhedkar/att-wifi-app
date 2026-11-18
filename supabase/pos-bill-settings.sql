-- WhatsApp bill heading and closing message, editable in Admin → POS setup → WhatsApp bill.
alter table settings add column if not exists bill_title text;
alter table settings add column if not exists bill_footer text;

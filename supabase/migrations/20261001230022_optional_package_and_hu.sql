-- Mirror of the migration already applied to the authorized project.
alter table public.occurrences
  drop constraint occurrences_package_id_check,
  drop constraint occurrences_hu_check,
  alter column package_id set default '',
  alter column hu set default '',
  add constraint occurrences_package_id_check check(length(btrim(package_id)) <= 100),
  add constraint occurrences_hu_check check(length(btrim(hu)) <= 100);

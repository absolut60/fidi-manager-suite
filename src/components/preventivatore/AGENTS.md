- Quote header/footer/summary receive the same calculated totals from the page; never calculate prices or margins locally.
- RiquadroScheda compact density and optional header content are opt-in; quote header presentation keeps existing picker/site handlers unchanged and preserves other card usages.
- RiquadroScheda delegates its frame and tone to ui/riquadro-anagrafica, also used by customer SectionCard and article Sezione, so cards share one presentation source.
- The quote client overlay checks the client SELECT through user RLS before embedding the existing client page; denied access renders only the dedicated quote-client DTO.
- Quote tabs persist in validated URL search state; row code/description are separate and desktop/mobile cells share the same unit-aware controls.- The quote article picker reuses FiltriCatalogoArticoli; its cascade choices live only in an in-memory store keyed by quote id (never DB/localStorage), so all rows of one quote share them and another quote starts empty.

- Quote header places Document/Customer and Terms/Site in independent flex columns from lg, with Notes/Attachments on the final grid row, so unequal section heights never stretch the opposite column.

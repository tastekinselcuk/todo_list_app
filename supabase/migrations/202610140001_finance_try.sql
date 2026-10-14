-- TRY is stored with currency holdings; its separate category is a UI grouping.
begin;
alter table public.finance_positions drop constraint if exists finance_position_instrument;
alter table public.finance_positions add constraint finance_position_instrument check(
 price_source='manual'
 or (price_source in ('frankfurter','market') and kind='forex' and instrument in ('TRY','USD','EUR','GBP','CHF','JPY','CAD','AUD','SAR'))
 or (price_source='coingecko' and kind='crypto' and instrument in ('bitcoin','ethereum','solana','cardano','avalanche-2','ripple','dogecoin','chainlink'))
 or (price_source='market' and kind='metal' and instrument in ('XAU','XAG','XPT','XPD','XAU22','GOLD_QUARTER','GOLD_HALF','GOLD_FULL','GOLD_ATA')));
commit;

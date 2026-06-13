UPDATE public.template_email
SET corpo = replace(corpo, 'Cordiali saluti,<br>{{nome_operatore}}</p>', 'Cordiali saluti,</p>')
WHERE tipo = 'sollecito_1';

UPDATE public.template_email
SET corpo = replace(corpo, E'distinti saluti.</p>\n<p>{{nome_operatore}}</p>', 'distinti saluti.</p>')
WHERE tipo = 'sollecito_2';

UPDATE public.template_email
SET corpo = replace(corpo, 'Distinti saluti,<br>{{nome_operatore}}</p>', 'Distinti saluti,</p>')
WHERE tipo = 'messa_in_mora';
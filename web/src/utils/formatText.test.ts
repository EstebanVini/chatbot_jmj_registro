import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMessageText } from './formatText.ts';

test('returns empty array for empty string', () => {
  assert.deepEqual(parseMessageText(''), []);
});

test('parses plain text without formatting', () => {
  const tokens = parseMessageText('Hola mundo, este es un texto simple.');
  assert.deepEqual(tokens, [
    { type: 'text', content: 'Hola mundo, este es un texto simple.' }
  ]);
});

test('parses bold text (*text*)', () => {
  const tokens = parseMessageText('Por favor responda *OK*');
  assert.deepEqual(tokens, [
    { type: 'text', content: 'Por favor responda ' },
    {
      type: 'bold',
      children: [{ type: 'text', content: 'OK' }]
    }
  ]);
});

test('parses single character bold (*M* / *F*)', () => {
  const tokens = parseMessageText('responda *M* para masculino o *F* para femenino');
  assert.deepEqual(tokens, [
    { type: 'text', content: 'responda ' },
    { type: 'bold', children: [{ type: 'text', content: 'M' }] },
    { type: 'text', content: ' para masculino o ' },
    { type: 'bold', children: [{ type: 'text', content: 'F' }] },
    { type: 'text', content: ' para femenino' }
  ]);
});

test('parses italic text (_text_)', () => {
  const tokens = parseMessageText('_Revise con cuidado: datos no coinciden._');
  assert.deepEqual(tokens, [
    {
      type: 'italic',
      children: [{ type: 'text', content: 'Revise con cuidado: datos no coinciden.' }]
    }
  ]);
});

test('parses bold text with colon and punctuation inside', () => {
  const tokens = parseMessageText('*Nombre(s):* Juan');
  assert.deepEqual(tokens, [
    {
      type: 'bold',
      children: [{ type: 'text', content: 'Nombre(s):' }]
    },
    { type: 'text', content: ' Juan' }
  ]);
});

test('parses punctuation immediately outside formatting marks', () => {
  const tokens = parseMessageText('¿*Seguro*? (*OK*)');
  assert.deepEqual(tokens, [
    { type: 'text', content: '¿' },
    { type: 'bold', children: [{ type: 'text', content: 'Seguro' }] },
    { type: 'text', content: '? (' },
    { type: 'bold', children: [{ type: 'text', content: 'OK' }] },
    { type: 'text', content: ')' }
  ]);
});

test('parses nested italic inside bold (*_text_*)', () => {
  const tokens = parseMessageText('*_muy importante_*');
  assert.deepEqual(tokens, [
    {
      type: 'bold',
      children: [
        {
          type: 'italic',
          children: [{ type: 'text', content: 'muy importante' }]
        }
      ]
    }
  ]);
});

test('parses nested bold inside italic (_*text*_)', () => {
  const tokens = parseMessageText('_*muy importante*_');
  assert.deepEqual(tokens, [
    {
      type: 'italic',
      children: [
        {
          type: 'bold',
          children: [{ type: 'text', content: 'muy importante' }]
        }
      ]
    }
  ]);
});

test('parses mixed inline bold and italic (*bold* con _italic_)', () => {
  const tokens = parseMessageText('*negrita con _cursiva_ y mas*');
  assert.deepEqual(tokens, [
    {
      type: 'bold',
      children: [
        { type: 'text', content: 'negrita con ' },
        {
          type: 'italic',
          children: [{ type: 'text', content: 'cursiva' }]
        },
        { type: 'text', content: ' y mas' }
      ]
    }
  ]);
});

test('does not format snake_case identifiers as italic', () => {
  const tokens = parseMessageText('mi_variable_de_datos no debe tener cursiva');
  assert.deepEqual(tokens, [
    { type: 'text', content: 'mi_variable_de_datos no debe tener cursiva' }
  ]);
});

test('does not format arithmetic asterisks as bold', () => {
  const tokens = parseMessageText('5 * 4 = 20');
  assert.deepEqual(tokens, [
    { type: 'text', content: '5 * 4 = 20' }
  ]);
});

test('does not format asterisks or underscores with inner spaces', () => {
  const tokens = parseMessageText('* texto con espacios * y _ otro con espacios _');
  assert.deepEqual(tokens, [
    { type: 'text', content: '* texto con espacios * y _ otro con espacios _' }
  ]);
});

test('does not format empty asterisks or underscores', () => {
  const tokens = parseMessageText('** y __');
  assert.deepEqual(tokens, [
    { type: 'text', content: '** y __' }
  ]);
});

test('preserves URLs as links alongside formatting', () => {
  const tokens = parseMessageText('Visita *este enlace*: https://registro.jmj2027.com y confirma.');
  assert.deepEqual(tokens, [
    { type: 'text', content: 'Visita ' },
    { type: 'bold', children: [{ type: 'text', content: 'este enlace' }] },
    { type: 'text', content: ': ' },
    { type: 'link', href: 'https://registro.jmj2027.com', text: 'https://registro.jmj2027.com' },
    { type: 'text', content: ' y confirma.' }
  ]);
});

test('parses full n8n passport summary message accurately', () => {
  const message =
    'Estos son los datos que leímos de su pasaporte:\n\n' +
    '*Apellidos:* Perez Lopez\n' +
    '*Nombre(s):* Juan Carlos\n' +
    '*No. de pasaporte:* G12345678\n' +
    '*Nacionalidad:* MEX\n' +
    '*Sexo:* M\n' +
    '*Fecha de nacimiento:* 05/03/1998\n' +
    '*Vence:* 10/10/2030\n\n' +
    '_Revise con cuidado: algunos datos podrían no coincidir con el documento._\n\n' +
    'Si todos los datos son correctos responda con la palabra *OK* para completar su registro.';

  const tokens = parseMessageText(message);

  // Check that all bold field titles were parsed as bold
  const boldTokens = tokens.filter(t => t.type === 'bold');
  assert.strictEqual(boldTokens.length, 8); // Apellidos:, Nombre(s):, No. de pasaporte:, Nacionalidad:, Sexo:, Fecha de nacimiento:, Vence:, OK

  // Check that the italic warning was parsed as italic
  const italicTokens = tokens.filter(t => t.type === 'italic');
  assert.strictEqual(italicTokens.length, 1);
});

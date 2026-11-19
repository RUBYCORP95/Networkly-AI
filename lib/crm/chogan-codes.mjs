// Codes imprimés sur la liste des parfums CHOGAN fournie pour TESAMI.
const numbersBySuffix = {
  W: "006 007 010 011 014 019 023 024 025 026 027 028 029 039 040 042 049 051 053 055 056 057 064 067 070 071 076 080 081 082 085 089 090 096 097 098 115 116 119 120 121 133 145 148 151 153 154 156 158 159 161 166 122 131 132 163 169 109 123",
  M: "001 002 003 004 012 015 016 018 020 021 022 030 032 033 037 038 048 052 061 062 069 079 086 087 088 091 140 147 150 152 157 160 162 168 094 113 136 164 167 074 075",
  U: "054 072 100 105 155 073 099 110 114 135 142 165 101 102 106 111 112 117 124 125 126 127 128 129 130 134 137 138 139 141 143 144 146 170",
  "": "045 058 059",
};

const codes = new Map(Object.entries(numbersBySuffix).flatMap(([suffix, numbers]) =>
  numbers.split(" ").map(number => [Number(number), number + suffix])));

export function listedChoganCode(query) {
  const match = /^(\d{1,3})([WMU]?)$/i.exec(query);
  if (!match) return null;
  const code = codes.get(Number(match[1]));
  return code && (!match[2] || code.endsWith(match[2].toUpperCase())) ? code : null;
}

export function choganCodeFromTitle(title) {
  const match = /\bparfum\s+chogan\s+n[°ºo.]\s*(\d+)\b/i.exec(title);
  return match ? listedChoganCode(match[1]) : null;
}

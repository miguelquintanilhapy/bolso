import type { Category } from '../lib/types';

type Def = Pick<Category, 'name' | 'kind' | 'icon' | 'color' | 'keywords'>;

export const DEFAULT_CATEGORIES: Def[] = [
  { name: 'Alimentação', kind: 'expense', icon: 'utensils', color: '#e5844a', keywords: ['mercado', 'supermercado', 'padaria', 'restaurante', 'lanche', 'ifood', 'almoco', 'jantar', 'cafe', 'pizza', 'hamburguer'] },
  { name: 'Transporte', kind: 'expense', icon: 'car', color: '#4a8fe5', keywords: ['uber', '99', 'onibus', 'metro', 'gasolina', 'combustivel', 'estacionamento', 'pedagio', 'passagem'] },
  { name: 'Moradia', kind: 'expense', icon: 'home', color: '#8b6fd6', keywords: ['aluguel', 'condominio', 'luz', 'agua', 'internet', 'gas', 'iptu'] },
  { name: 'Saúde', kind: 'expense', icon: 'heart', color: '#e0566b', keywords: ['farmacia', 'remedio', 'medico', 'consulta', 'dentista', 'academia', 'plano'] },
  { name: 'Lazer', kind: 'expense', icon: 'music', color: '#d6a13a', keywords: ['cinema', 'netflix', 'spotify', 'bar', 'viagem', 'show', 'jogo', 'streaming'] },
  { name: 'Educação', kind: 'expense', icon: 'book', color: '#3aa88f', keywords: ['curso', 'livro', 'faculdade', 'escola', 'mensalidade'] },
  { name: 'Compras', kind: 'expense', icon: 'bag', color: '#c25fa5', keywords: ['roupa', 'sapato', 'shopee', 'amazon', 'presente', 'tv'] },
  { name: 'Assinaturas', kind: 'expense', icon: 'repeat', color: '#6b7a8f', keywords: ['assinatura'] },
  { name: 'Outros', kind: 'expense', icon: 'tag', color: '#8a8f98', keywords: [] },
  { name: 'Salário', kind: 'income', icon: 'wallet', color: '#2f9e5b', keywords: ['salario', 'pagamento', 'holerite'] },
  { name: 'Renda extra', kind: 'income', icon: 'sparkles', color: '#3aa88f', keywords: ['freela', 'freelance', 'venda', 'rendimento', 'bonus', 'reembolso'] },
];

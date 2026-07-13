/* ============================================================
   NST PRINT — functions/api/calcular.js
   Cloudflare Pages Function. Roda no servidor da Cloudflare, não
   no navegador do visitante — os números internos de custo e o
   preço de investimento por máquina ficam só aqui dentro. O
   navegador só manda os dados do formulário (máquina, volume,
   dias, preço) e recebe de volta apenas o resultado já calculado
   (capacidade, receita, payback, série do gráfico).

   Sem banco de dados, sem estado: cada requisição é independente
   e nada fica armazenado no servidor.
   ============================================================ */

/* ============================================================
   CONSTANTES / PREMISSAS
   Nunca saem desta function — o objeto devolvido ao navegador
   (ver final do arquivo) não inclui nenhum destes valores.
   ============================================================ */

var HORAS_PRODUTIVAS_POR_DIA = 8;
var MESES_PROJECAO_GRAFICO = 24;

var TINTA_PRECO_POR_LITRO = 190;
// Consumo real medido pela NST numa largura de referência de
// 0,60m: 0,012 L/m de CMYK + 0,018 L/m de branco.
var TINTA_CONSUMO_L_POR_METRO_REF = 0.012 + 0.018;
var LARGURA_REFERENCIA_M = 0.60;
var CUSTO_TINTA_POR_M2 = (TINTA_PRECO_POR_LITRO * TINTA_CONSUMO_L_POR_METRO_REF) / LARGURA_REFERENCIA_M;

var TPU_PRECO_POR_KG = 78;
var TPU_RENDIMENTO_METROS_POR_KG_REF = 100;
var CUSTO_TPU_POR_M2 = (TPU_PRECO_POR_KG / TPU_RENDIMENTO_METROS_POR_KG_REF) / LARGURA_REFERENCIA_M;

var FILME_COMPRIMENTO_ROLO_M = 100;
var FILME_60CM_PRECO_ROLO = 360;
var FILME_30CM_PRECO_ROLO = 239;
var FILME_60CM_POR_METRO = FILME_60CM_PRECO_ROLO / FILME_COMPRIMENTO_ROLO_M;
var FILME_30CM_POR_METRO = FILME_30CM_PRECO_ROLO / FILME_COMPRIMENTO_ROLO_M;

// Preço de venda da máquina (já com as cabeças de impressão
// inclusas) e velocidade real por modelo. A da NST 2H veio do
// dado real de operação da NST; as demais foram derivadas da
// velocidade em m²/h publicada no site (m²/h ÷ largura do filme).
var MACHINES = [
  {
    id: 'nst-5h',
    nome: 'NST 5H',
    larguraM: 0.60,
    velocidadeMLinearH: 30 / 0.60, // 30 m²/h (média de 40 e 20) ÷ 0,60m
    investimentoFixo: 155000,
    custoFilmePorMetro: FILME_60CM_POR_METRO
  },
  {
    id: 'nst-4h',
    nome: 'NST 4H',
    larguraM: 0.60,
    velocidadeMLinearH: 19 / 0.60, // 19 m²/h (média do site) ÷ 0,60m
    investimentoFixo: 135000,
    custoFilmePorMetro: FILME_60CM_POR_METRO
  },
  {
    id: 'nst-2h',
    nome: 'NST 2H',
    larguraM: 0.60,
    velocidadeMLinearH: 12, // valor real de operação informado pela NST (não derivado)
    investimentoFixo: 88000,
    custoFilmePorMetro: FILME_60CM_POR_METRO
  },
  {
    id: 'nst-dual',
    nome: 'NST DUAL',
    larguraM: 0.30,
    velocidadeMLinearH: 2.5 / 0.30, // 2,5 m²/h (média do site) ÷ 0,30m
    investimentoFixo: 59000,
    custoFilmePorMetro: FILME_30CM_POR_METRO
  }
];

/* ============================================================
   REGRAS DE NEGÓCIO (mesma lógica pura que já existia no front)
   ============================================================ */

function capacidadeDiaMetro(machine) {
  return machine.velocidadeMLinearH * HORAS_PRODUTIVAS_POR_DIA;
}

function custoOperacionalPorMetro(machine) {
  return (CUSTO_TINTA_POR_M2 + CUSTO_TPU_POR_M2) * machine.larguraM + machine.custoFilmePorMetro;
}

function calcularResultado(input) {
  var machine = input.machine;

  var capDiaM = capacidadeDiaMetro(machine);
  var capMesM = capDiaM * input.diasMes;

  var metaExcedeCapacidade = input.volumeDia > capDiaM;
  var producaoEfetivaDiaM = Math.min(input.volumeDia, capDiaM);
  var producaoEfetivaMesM = producaoEfetivaDiaM * input.diasMes;
  var utilizacaoCapacidade = capDiaM > 0 ? (producaoEfetivaDiaM / capDiaM) : 0;

  var custoPorMetro = custoOperacionalPorMetro(machine);
  var lucroPorMetro = input.precoVenda - custoPorMetro;
  var inviavelNoPrecoAtual = lucroPorMetro <= 0;

  var receitaPotencialMensal = producaoEfetivaMesM * input.precoVenda;
  var lucroMensalEstimado = producaoEfetivaMesM * lucroPorMetro;
  var investimento = machine.investimentoFixo;
  var paybackMeses = lucroMensalEstimado > 0 ? (investimento / lucroMensalEstimado) : Infinity;

  var meses = [];
  var serieProducaoPropria = [];
  var serieTerceirizar = input.custoTerceirizacao != null ? [] : null;
  var custoTerceirizarPorMes = input.custoTerceirizacao != null
    ? producaoEfetivaMesM * input.custoTerceirizacao
    : null;
  var mesCruzamento = null;

  for (var mes = 0; mes <= MESES_PROJECAO_GRAFICO; mes++) {
    meses.push(mes);
    var posicaoPropria = -investimento + lucroMensalEstimado * mes;
    serieProducaoPropria.push(posicaoPropria);

    if (serieTerceirizar) {
      var posicaoTerceirizar = -custoTerceirizarPorMes * mes;
      serieTerceirizar.push(posicaoTerceirizar);
      if (mesCruzamento === null && posicaoPropria >= posicaoTerceirizar) {
        mesCruzamento = mes;
      }
    }
  }

  return {
    machineNome: machine.nome,
    capDiaM: capDiaM,
    capMesM: capMesM,
    metaExcedeCapacidade: metaExcedeCapacidade,
    producaoEfetivaDiaM: producaoEfetivaDiaM,
    utilizacaoCapacidade: utilizacaoCapacidade,
    receitaPotencialMensal: receitaPotencialMensal,
    inviavelNoPrecoAtual: inviavelNoPrecoAtual,
    paybackMeses: Number.isFinite(paybackMeses) ? paybackMeses : null,
    meses: meses,
    serieProducaoPropria: serieProducaoPropria,
    serieTerceirizar: serieTerceirizar,
    mesCruzamento: mesCruzamento
  };
}

/* ============================================================
   HANDLER HTTP
   ============================================================ */

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

export async function onRequestPost(context) {
  var body;
  try {
    body = await context.request.json();
  } catch (e) {
    return jsonResponse({ error: 'JSON inválido.' }, 400);
  }

  var machine = MACHINES.filter(function (m) { return m.id === body.machineId; })[0];
  if (!machine) {
    return jsonResponse({ error: 'Máquina inválida.' }, 400);
  }

  var volumeDia = Number(body.volumeDia);
  var diasMes = Number(body.diasMes);
  var precoVenda = Number(body.precoVenda);
  var custoTerceirizacao = (body.custoTerceirizacao !== null && body.custoTerceirizacao !== undefined && body.custoTerceirizacao !== '')
    ? Number(body.custoTerceirizacao)
    : null;

  if (!(volumeDia > 0) || !(diasMes >= 1 && diasMes <= 31) || !(precoVenda > 0)) {
    return jsonResponse({ error: 'Dados de produção inválidos.' }, 400);
  }
  if (custoTerceirizacao !== null && !(custoTerceirizacao >= 0)) {
    return jsonResponse({ error: 'Custo de terceirização inválido.' }, 400);
  }

  var resultado = calcularResultado({
    machine: machine,
    volumeDia: volumeDia,
    diasMes: diasMes,
    precoVenda: precoVenda,
    custoTerceirizacao: custoTerceirizacao
  });

  return jsonResponse(resultado);
}

// Qualquer outro método (GET, etc.) recebe 405 — este endpoint só
// existe para o POST vindo do formulário da calculadora.
export async function onRequestGet() {
  return jsonResponse({ error: 'Método não permitido. Use POST.' }, 405);
}

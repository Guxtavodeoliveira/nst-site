/* ============================================================
   NST PRINT — calculadora.js
   Calculadora de viabilidade financeira (wizard de 3 passos).
   Vanilla JS, sem dependências além do Chart.js (carregado via
   CDN no index.html). O cálculo em si roda numa Cloudflare Pages
   Function (functions/api/calcular.js) — este arquivo só cuida do
   formulário e da exibição do resultado. Nenhuma constante de
   custo, preço de insumo ou preço de máquina existe aqui: quem
   abrir "Exibir código-fonte" não encontra esses números.

   O resultado exibido é sempre o número real da fórmula aplicada
   aos dados digitados pelo visitante. Nada aqui "força" um
   payback curto: se os números informados derem um retorno
   longo, é isso que a tela mostra — só a mensagem de contexto
   (tom, cor do selo) muda, nunca o valor calculado.
   ============================================================ */
'use strict';

(function () {

  /* ============================================================
     CONSTANTES / DADOS PÚBLICOS
     Só o que já é público no site (velocidade, badges) ou é só
     interface (limiares de mensagem). Preço de insumo, preço de
     máquina e a fórmula de custo ficam só na Function do servidor.
     ============================================================ */

  var HORAS_PRODUTIVAS_POR_DIA = 8;
  var DIAS_MES_PADRAO = 22;
  var MESES_PROJECAO_GRAFICO = 24;

  // Faixas de payback usadas SOMENTE para escolher o tom da
  // mensagem exibida (nunca alteram o número calculado no servidor).
  var PAYBACK_LIMIAR_RAPIDO_MESES = 12;
  var PAYBACK_LIMIAR_BOM_MESES = 24;
  var PAYBACK_LIMIAR_MODERADO_MESES = 36;

  var WHATSAPP_NUMERO = '5547999193256';

  // Dados usados só pelo quiz "não sei qual escolher" (comparação
  // de capacidade) e pelos cards do passo 1 — nada de custo aqui.
  var MACHINES = [
    { id: 'nst-5h', nome: 'NST 5H', larguraM: 0.60, velocidadeMLinearH: 30 / 0.60 },
    { id: 'nst-4h', nome: 'NST 4H', larguraM: 0.60, velocidadeMLinearH: 19 / 0.60 },
    { id: 'nst-2h', nome: 'NST 2H', larguraM: 0.60, velocidadeMLinearH: 12 },
    { id: 'nst-dual', nome: 'NST DUAL', larguraM: 0.30, velocidadeMLinearH: 2.5 / 0.30 }
  ];

  /* ============================================================
     FORMATAÇÃO
     ============================================================ */

  function formatNumero(valor, casas) {
    return valor.toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: casas != null ? casas : 1
    });
  }

  function formatMetros(valor) {
    return formatNumero(valor, 1) + ' m';
  }

  function formatBRL(valor) {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0
    });
  }

  function formatMeses(valor) {
    var arredondado = valor < 1 ? Math.round(valor * 10) / 10 : Math.round(valor);
    var texto = formatNumero(arredondado, valor < 1 ? 1 : 0);
    return texto + (arredondado === 1 ? ' mês' : ' meses');
  }

  function formatPercentual(valor) {
    return formatNumero(valor * 100, 0) + '%';
  }

  function getCssVar(nome, fallback) {
    try {
      var valor = getComputedStyle(document.documentElement).getPropertyValue(nome);
      return valor && valor.trim() ? valor.trim() : fallback;
    } catch (e) {
      return fallback;
    }
  }

  /* ============================================================
     QUIZ "NÃO SEI QUAL ESCOLHER" (só compara capacidade, sem custo)
     ============================================================ */

  function capacidadeDiaMetro(machine) {
    return machine.velocidadeMLinearH * HORAS_PRODUTIVAS_POR_DIA;
  }

  function sugerirMaquina(volumeMetrosDia) {
    var candidatos = MACHINES
      .map(function (m) { return { machine: m, capacidade: capacidadeDiaMetro(m) }; })
      .sort(function (a, b) { return a.capacidade - b.capacidade; });

    for (var i = 0; i < candidatos.length; i++) {
      if (candidatos[i].capacidade >= volumeMetrosDia) {
        return { machine: candidatos[i].machine, excedeTodas: false };
      }
    }
    var maior = candidatos[candidatos.length - 1];
    return { machine: maior.machine, excedeTodas: true };
  }

  function getPaybackTier(meses) {
    if (meses <= PAYBACK_LIMIAR_RAPIDO_MESES) {
      return {
        tier: 'rapido',
        label: 'Retorno rápido',
        mensagem: 'Com esses números, o investimento tende a se pagar em menos de um ano — um cenário bastante favorável.'
      };
    }
    if (meses <= PAYBACK_LIMIAR_BOM_MESES) {
      return {
        tier: 'bom',
        label: 'Retorno dentro do esperado',
        mensagem: 'Esse é um prazo de retorno considerado saudável para este tipo de equipamento.'
      };
    }
    if (meses <= PAYBACK_LIMIAR_MODERADO_MESES) {
      return {
        tier: 'moderado',
        label: 'Retorno de médio prazo',
        mensagem: 'O retorno acontece em um prazo mais longo. Aumentar o volume de produção ou revisar o preço praticado pode melhorar esse cenário.'
      };
    }
    return {
      tier: 'longo',
      label: 'Retorno de longo prazo',
      mensagem: 'Com esse volume, o retorno é de longo prazo. Um modelo diferente ou um volume maior de produção pode melhorar esse cenário — fale com um especialista para encontrar o modelo ideal para o seu caso.'
    };
  }

  /* ============================================================
     WIZARD — estado e controle de DOM (3 passos)
     ============================================================ */

  document.addEventListener('DOMContentLoaded', function () {
    var section = document.getElementById('calculadora-viabilidade');
    if (!section) return;

    var state = {
      machine: null,
      volumeDia: null,
      diasMes: DIAS_MES_PADRAO,
      precoVenda: null,
      custoTerceirizacao: null
    };

    var currentStep = 1;
    var chartInstance = null;
    var TOTAL_STEPS = 3;

    /* ---------- Referências de DOM ---------- */
    var steps = Array.prototype.slice.call(section.querySelectorAll('.calc__step'));
    var progressSteps = Array.prototype.slice.call(section.querySelectorAll('.calc__progress-step'));
    var srStatus = document.getElementById('calc-sr-status');
    var navWrap = document.getElementById('calc-nav');
    var prevBtn = document.getElementById('calc-prev');
    var nextBtn = document.getElementById('calc-next');

    var machineInputs = Array.prototype.slice.call(section.querySelectorAll('input[name="calc-machine"]'));
    var quizToggle = document.getElementById('calc-quiz-toggle');
    var quizPanel = document.getElementById('calc-quiz');
    var quizVolume = document.getElementById('calc-quiz-volume');
    var quizSuggestBtn = document.getElementById('calc-quiz-suggest');
    var quizResult = document.getElementById('calc-quiz-result');

    var volumeInput = document.getElementById('calc-volume');
    var daysInput = document.getElementById('calc-days');
    var priceInput = document.getElementById('calc-price');
    var outsourceInput = document.getElementById('calc-outsource');
    var step2FetchError = document.getElementById('calc-step2-fetch-error');

    var restartBtn = document.getElementById('calc-restart');
    var finalWaLink = document.getElementById('calc-final-wa');

    if (!nextBtn) return; // marcação da calculadora incompleta — não quebra o resto do site

    /* ---------- Utilitários de UI ---------- */

    function setFieldError(input, mensagem) {
      var erroEl = section.querySelector('[data-error-for="' + input.id + '"]');
      if (mensagem) {
        input.setAttribute('aria-invalid', 'true');
        if (erroEl) { erroEl.textContent = mensagem; erroEl.hidden = false; }
      } else {
        input.removeAttribute('aria-invalid');
        if (erroEl) { erroEl.hidden = true; erroEl.textContent = ''; }
      }
    }

    function parseNumeroInput(input) {
      var v = input.value.trim();
      if (v === '') return null;
      var n = parseFloat(v.replace(',', '.'));
      return isNaN(n) ? null : n;
    }

    /* ---------- Progresso / navegação entre passos ---------- */

    var STEP_LABELS = {
      1: 'Passo 1 de 3: máquina',
      2: 'Passo 2 de 3: dados de produção',
      3: 'Passo 3 de 3: resultado'
    };

    var progressFill = document.getElementById('calc-progress-fill');

    function updateProgressUI(n) {
      progressSteps.forEach(function (el) {
        var stepN = parseInt(el.getAttribute('data-step'), 10);
        el.classList.remove('is-active', 'is-done');
        if (stepN < n) el.classList.add('is-done');
        else if (stepN === n) el.classList.add('is-active');
      });
      if (progressFill && progressSteps.length > 1) {
        var pct = ((n - 1) / (progressSteps.length - 1)) * 100;
        progressFill.style.width = pct + '%';
      }
    }

    var wizardEl = section.querySelector('.calc__wizard');

    function applyStep(n) {
      currentStep = n;
      steps.forEach(function (stepEl) {
        stepEl.hidden = parseInt(stepEl.getAttribute('data-step'), 10) !== n;
      });
      updateProgressUI(n);

      if (navWrap) navWrap.hidden = (n === TOTAL_STEPS);
      if (prevBtn) prevBtn.hidden = (n === 1 || n === TOTAL_STEPS);
      if (nextBtn) nextBtn.textContent = (n === TOTAL_STEPS - 1) ? 'Calcular resultado' : 'Avançar';

      if (srStatus) srStatus.textContent = STEP_LABELS[n] || '';
    }

    function showStep(n) {
      applyStep(n);

      var heading = section.querySelector('.calc__step[data-step="' + n + '"] .calc__step-title');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }

      var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var target = wizardEl || section;
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }

    /* ---------- Passo 1: seleção de máquina + quiz ---------- */

    if (quizToggle && quizPanel) {
      quizToggle.addEventListener('click', function () {
        var abrir = quizPanel.hidden;
        quizPanel.hidden = !abrir;
        quizToggle.setAttribute('aria-expanded', abrir ? 'true' : 'false');
      });
    }

    if (quizSuggestBtn) {
      quizSuggestBtn.addEventListener('click', function () {
        var volume = parseNumeroInput(quizVolume);
        if (!volume || volume <= 0) {
          quizResult.hidden = false;
          quizResult.innerHTML = 'Informe um volume por dia maior que zero para sugerirmos um modelo.';
          return;
        }
        var sugestao = sugerirMaquina(volume);
        var nomeMaquina = sugestao.machine.nome;

        var texto = sugestao.excedeTodas
          ? 'Para esse volume, a <strong>' + nomeMaquina + '</strong> é o nosso maior modelo — mas esse é um volume alto para uma única máquina. Um especialista pode te ajudar a planejar a produção.'
          : 'Para ' + formatNumero(volume, 1) + ' metros lineares/dia, a <strong>' + nomeMaquina + '</strong> atende confortavelmente esse volume.';

        quizResult.hidden = false;
        quizResult.innerHTML = texto +
          '<button type="button" class="btn btn--outline-light calc__quiz-use" id="calc-quiz-use">Usar a ' + nomeMaquina + '</button>';

        var useBtn = document.getElementById('calc-quiz-use');
        if (useBtn) {
          useBtn.addEventListener('click', function () {
            var radio = machineInputs.filter(function (i) { return i.value === sugestao.machine.id; })[0];
            if (radio) radio.checked = true;

            // Aproveita o volume já digitado no quiz para pré-preencher o passo 2.
            volumeInput.value = volume;

            quizPanel.hidden = true;
            quizToggle.setAttribute('aria-expanded', 'false');
            var machineError = document.getElementById('calc-step1-error');
            if (machineError) machineError.hidden = true;
          });
        }
      });
    }

    function validateStep1() {
      var selecionada = machineInputs.filter(function (i) { return i.checked; })[0];
      var errorEl = document.getElementById('calc-step1-error');
      if (!selecionada) {
        if (errorEl) { errorEl.hidden = false; errorEl.textContent = 'Selecione uma máquina para continuar.'; }
        return false;
      }
      if (errorEl) errorEl.hidden = true;
      state.machine = MACHINES.filter(function (m) { return m.id === selecionada.value; })[0];
      return true;
    }

    /* ---------- Passo 2: dados de produção ---------- */

    function validateStep2() {
      var valido = true;

      var volume = parseNumeroInput(volumeInput);
      if (!volume || volume <= 0) {
        setFieldError(volumeInput, 'Informe um valor maior que zero.');
        valido = false;
      } else {
        setFieldError(volumeInput, null);
        state.volumeDia = volume;
      }

      var dias = parseNumeroInput(daysInput);
      if (!dias || dias < 1 || dias > 31) {
        setFieldError(daysInput, 'Informe um valor entre 1 e 31.');
        valido = false;
      } else {
        setFieldError(daysInput, null);
        state.diasMes = Math.round(dias);
      }

      var preco = parseNumeroInput(priceInput);
      if (!preco || preco <= 0) {
        setFieldError(priceInput, 'Informe um valor maior que zero.');
        valido = false;
      } else {
        setFieldError(priceInput, null);
        state.precoVenda = preco;
      }

      var custoTerc = parseNumeroInput(outsourceInput);
      if (custoTerc != null && custoTerc < 0) {
        setFieldError(outsourceInput, 'Informe um valor maior ou igual a zero, ou deixe em branco.');
        valido = false;
      } else {
        setFieldError(outsourceInput, null);
        state.custoTerceirizacao = custoTerc;
      }

      return valido;
    }

    /* ---------- Chamada à Cloudflare Pages Function ---------- */

    function fetchResultado() {
      var payload = {
        machineId: state.machine.id,
        volumeDia: state.volumeDia,
        diasMes: state.diasMes,
        precoVenda: state.precoVenda,
        custoTerceirizacao: state.custoTerceirizacao
      };

      return fetch('/api/calcular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (resp) {
        if (!resp.ok) throw new Error('Falha ao calcular (' + resp.status + ')');
        return resp.json();
      });
    }

    /* ---------- Passo 3: dashboard do resultado ---------- */

    function buildWhatsAppLink(mensagem) {
      return 'https://wa.me/' + WHATSAPP_NUMERO + '?text=' + encodeURIComponent(mensagem);
    }

    function renderChart(resultado) {
      var canvas = document.getElementById('calc-chart');
      if (!canvas || typeof Chart === 'undefined') return;

      var gridColor = getCssVar('--line-dark', 'rgba(255,255,255,.09)');
      var labelColor = getCssVar('--titan-300', '#aeb2a6');
      var corPropria = getCssVar('--blue-600', '#2e6cf6');
      var corTerceirizar = getCssVar('--titan-400', '#8f948a');

      var datasets = [{
        label: 'Produção própria (NST)',
        data: resultado.serieProducaoPropria,
        borderColor: corPropria,
        backgroundColor: corPropria,
        tension: 0.25,
        pointRadius: 0,
        borderWidth: 2.5
      }];

      if (resultado.serieTerceirizar) {
        datasets.push({
          label: 'Continuar terceirizando',
          data: resultado.serieTerceirizar,
          borderColor: corTerceirizar,
          backgroundColor: corTerceirizar,
          borderDash: [6, 4],
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2
        });
      }

      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
      }

      chartInstance = new Chart(canvas, {
        type: 'line',
        data: {
          labels: resultado.meses.map(function (m) { return m + 'm'; }),
          datasets: datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: {
              grid: { color: gridColor },
              ticks: { color: labelColor, maxTicksLimit: 9 }
            },
            y: {
              grid: { color: gridColor },
              ticks: { color: labelColor, callback: function (v) { return formatBRL(v); } }
            }
          },
          plugins: {
            legend: { labels: { color: labelColor } },
            tooltip: {
              callbacks: {
                label: function (ctx) { return ctx.dataset.label + ': ' + formatBRL(ctx.parsed.y); }
              }
            }
          }
        }
      });
    }

    function renderResultado(resultado) {
      document.getElementById('calc-res-capacidade-dia').textContent = formatMetros(resultado.capDiaM) + '/dia';
      document.getElementById('calc-res-capacidade-mes').textContent = formatMetros(resultado.capMesM) + '/mês';

      document.getElementById('calc-res-utilizacao').textContent = formatPercentual(resultado.utilizacaoCapacidade);
      document.getElementById('calc-res-utilizacao-nota').textContent = resultado.metaExcedeCapacidade
        ? 'sua meta ultrapassa a capacidade da ' + resultado.machineNome
        : 'da capacidade da ' + resultado.machineNome + ' seria usada';

      document.getElementById('calc-res-receita').textContent = formatBRL(resultado.receitaPotencialMensal);

      var capacidadeNota = document.getElementById('calc-res-capacidade-nota');
      if (resultado.metaExcedeCapacidade) {
        capacidadeNota.hidden = false;
        capacidadeNota.textContent = 'A meta de produção que você informou é maior do que a capacidade da ' +
          resultado.machineNome + '. Para manter a simulação realista, usamos a capacidade máxima da máquina (' +
          formatMetros(resultado.capDiaM) + '/dia) — considere um modelo maior ou mais de uma máquina para atingir o volume desejado.';
      } else {
        capacidadeNota.hidden = false;
        capacidadeNota.textContent = 'Sua meta está dentro da capacidade da ' + resultado.machineNome +
          '. Há espaço para crescer o volume de produção sem precisar investir em outra máquina.';
      }

      var badge = document.getElementById('calc-res-payback-badge');
      var paybackValueEl = document.getElementById('calc-res-payback-meses');
      var paybackMsgEl = document.getElementById('calc-res-payback-msg');

      if (resultado.inviavelNoPrecoAtual) {
        badge.textContent = 'Preço não cobre o custo';
        badge.className = 'calc__payback-badge calc__payback-badge--inviavel';
        paybackValueEl.textContent = 'Prejuízo por metro produzido';
        paybackMsgEl.textContent = 'Com o preço de venda informado, o custo estimado de produção (tinta, filme e pó) fica maior do que a receita — ou seja, cada metro produzido gera prejuízo, não lucro, antes mesmo de pensar em payback. Revisar o preço de venda ou o volume, ou falar com um especialista sobre o modelo mais adequado, tende a melhorar esse cenário.';
      } else {
        var tier = getPaybackTier(resultado.paybackMeses);
        badge.textContent = tier.label;
        badge.className = 'calc__payback-badge calc__payback-badge--' + tier.tier;
        paybackValueEl.textContent = formatMeses(resultado.paybackMeses);
        paybackMsgEl.textContent = tier.mensagem;
      }

      renderChart(resultado);

      document.getElementById('calc-res-12m').textContent = formatBRL(resultado.serieProducaoPropria[12]);
      document.getElementById('calc-res-24m').textContent = formatBRL(resultado.serieProducaoPropria[24]);

      var cruzamentoEl = document.getElementById('calc-res-cruzamento');
      if (resultado.serieTerceirizar) {
        cruzamentoEl.hidden = false;
        if (resultado.mesCruzamento !== null) {
          cruzamentoEl.textContent = resultado.mesCruzamento === 0
            ? 'Mesmo considerando o investimento inicial, produzir na sua própria máquina já se compara melhor do que continuar terceirizando desde o primeiro mês.'
            : 'A produção própria supera o custo acumulado de terceirização a partir do mês ' + resultado.mesCruzamento + '.';
        } else {
          cruzamentoEl.textContent = 'Dentro dos ' + MESES_PROJECAO_GRAFICO + ' meses projetados, a produção própria ainda não supera o custo acumulado de terceirização com esses números — considere revisar o volume ou o preço praticado.';
        }
      } else {
        cruzamentoEl.hidden = true;
        cruzamentoEl.textContent = '';
      }

      document.getElementById('calc-res-premissas').textContent =
        'Estimativa de custo e investimento com base em valores internos da NST Print (máquina, tinta, filme e pó adesivo) — não é um preço de mercado genérico, mas o custo real do seu caso pode variar conforme o tipo de estampa, a negociação e outros fatores de produção. Não inclui energia nem mão de obra. Ajuste os passos anteriores para simular outros cenários.';

      var mensagemFinal;
      if (resultado.inviavelNoPrecoAtual) {
        mensagemFinal = 'Olá! Simulei no site da NST Print: máquina ' + resultado.machineNome +
          ', produção de ' + formatNumero(resultado.producaoEfetivaDiaM, 1) + ' metros lineares/dia. Com o preço que eu pretendia cobrar, o resultado não ficou favorável — quero entender com um especialista qual modelo ou volume faria mais sentido para o meu caso.';
      } else {
        mensagemFinal = 'Olá! Simulei no site da NST Print: máquina ' + resultado.machineNome +
          ', produção de ' + formatNumero(resultado.producaoEfetivaDiaM, 1) + ' metros lineares/dia, payback estimado em ' +
          formatMeses(resultado.paybackMeses) + '. Quero um orçamento personalizado.';
      }
      finalWaLink.setAttribute('href', buildWhatsAppLink(mensagemFinal));
    }

    /* ---------- Reiniciar ---------- */

    function resetWizard() {
      state = {
        machine: null,
        volumeDia: null,
        diasMes: DIAS_MES_PADRAO,
        precoVenda: null,
        custoTerceirizacao: null
      };

      machineInputs.forEach(function (i) { i.checked = false; });
      volumeInput.value = '';
      daysInput.value = DIAS_MES_PADRAO;
      priceInput.value = '';
      outsourceInput.value = '';

      [volumeInput, daysInput, priceInput, outsourceInput].forEach(function (input) {
        setFieldError(input, null);
      });

      if (step2FetchError) step2FetchError.hidden = true;
      if (quizPanel) quizPanel.hidden = true;
      if (quizResult) { quizResult.hidden = true; quizResult.innerHTML = ''; }
      if (quizVolume) quizVolume.value = '';

      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
      }

      showStep(1);
    }

    if (restartBtn) {
      restartBtn.addEventListener('click', resetWizard);
    }

    /* ---------- Navegação Avançar / Voltar ---------- */

    nextBtn.addEventListener('click', function () {
      if (currentStep === 1) {
        if (!validateStep1()) return;
        showStep(2);
        return;
      }

      if (currentStep === 2) {
        if (!validateStep2()) return;

        if (step2FetchError) step2FetchError.hidden = true;
        nextBtn.disabled = true;
        var textoOriginal = nextBtn.textContent;
        nextBtn.textContent = 'Calculando...';

        fetchResultado().then(function (resultado) {
          nextBtn.disabled = false;
          nextBtn.textContent = textoOriginal;
          renderResultado(resultado);
          showStep(3);
        }).catch(function () {
          nextBtn.disabled = false;
          nextBtn.textContent = textoOriginal;
          if (step2FetchError) step2FetchError.hidden = false;
        });
      }
    });

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        if (currentStep > 1) showStep(currentStep - 1);
      });
    }

    /* ---------- Estado inicial (sem rolar a página) ---------- */
    daysInput.value = DIAS_MES_PADRAO;
    applyStep(1);
  });

})();

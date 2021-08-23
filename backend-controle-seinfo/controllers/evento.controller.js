const db = require('../models/index');

const Evento = db.evento;
const Agenda = db.agenda;
const Inscricao = db.inscricaoEvento;
const Lote = db.lote;
const Pessoa = db.pessoa;
const Organizacao = db.organizacao;

const atob = (b64Encoded) => Buffer.from(b64Encoded, 'base64').toString();

// Post do Evento
exports.create = async (req, res) => {
  try {
    const {
      data_ini,
      hora_ini,
      data_fim,
      hora_fim,
      local_eve,
      nome,
      descricao,
      select_status,
      lote,
      cpfOrganizador,
    } = req.body;

    const agenda = await Agenda.create({
      dataHoraInicio: new Date(`${data_ini}T${hora_ini}:00.003Z`),
      dataHoraFim: new Date(`${data_fim}T${hora_fim}:00.003Z`),
      local: local_eve,
    });

    console.log(agenda);

    const evento = await Evento.create({
      nome,
      descricao,
      status: select_status,
      idAgenda: agenda.idAgenda,
    });

    await Promise.all(
      lote.forEach(async (loteItem) => {
        await Lote.create({
          idEvento: evento.idEvento,
          valor: loteItem.valor_lote,
          dataAbertura: loteItem.data_inicio_lote,
          dataFechamento: loteItem.data_fim_lote,
        });
      })
    );

    const pessoa = await Pessoa.findOne({
      where: { CPF: cpfOrganizador },
    });

    await Organizacao.create({
      // 'horasParticipacao': req.body.horasParticipacao,
      idEvento: evento.idEvento,
      CPF: atob(pessoa.CPF),
    });

    return res.status(200).json(evento);
  } catch (error) {
    return res.status(500).json(error);
  }
};

exports.findById = async (req, res) => {
  try {
    const evento = await Evento.findOne({
      where: { idEvento: req.params.idEvento },
      attributes: ['idEvento', 'nome', 'descricao', 'status'],
      include: [
        {
          model: db.agenda,
          as: 'agendamento',
          attributes: ['dataHoraInicio', 'dataHoraFim', 'local'],
        },
      ],
    });

    const atividades = await evento.getAtividades({
      attributes: [
        'idAtividade',
        'titulo',
        'valor',
        'descricao',
        'horasParticipacao',
        'quantidadeVagas',
        'dataInicio',
      ],
      include: [
        {
          model: db.categoria,
          as: 'categoriaAtv',
          attributes: ['nome'],
        },
        {
          model: db.agenda,
          as: 'atvAgenda',
          through: { attributes: [] },
        },
      ],
      order: [['dataInicio', 'ASC']],
    });
    const lotes = await evento.getLotes({
      attributes: ['idLote', 'valor', 'dataAbertura', 'dataFechamento'],
    });
    const lotesVencidos = [];
    const lotesDisponiveis = [];
    const dataAtual = new Date();

    lotes.forEach((lote) => {
      const dataLote = new Date(lote.dataFechamento);

      if (dataLote < dataAtual) {
        lotesVencidos.push(lote);
      } else {
        lotesDisponiveis.push(lote);
      }
    });

    // eslint-disable-next-line prefer-const
    let atividadesPorCategorias = {};
    atividades.forEach((atividade) => {
      atividadesPorCategorias[atividade.categoriaAtv.nome] = {
        ...atividadesPorCategorias[atividade.categoriaAtv.nome],
        [atividade.titulo]: atividade,
      };
    });

    const eventosFormatados = {
      ...evento.dataValues,
      atividades: atividadesPorCategorias,
      lotesDisponiveis,
      lotesVencidos,
    };

    return res.status(200).json(eventosFormatados);
  } catch (error) {
    console.log(error);
    return res.status(500).json(error);
  }
};

exports.findAll = (req, res) => {
  Evento.findAll({
    include: [
      { model: db.lote, as: 'lotes' },
      { model: db.agenda, as: 'agendamento' },
    ],
  })
    .then((evento) => {
      res.send(evento); // Retorna um Json para a Pagina da API
    })
    .catch((err) => {
      res.status(500).send(`Error -> ${err}`);
    });
};

exports.atualiza = (req, res) => {
  Evento.update(
    {
      nome: req.body.nome,
      descricao: req.body.descricao,
      status: req.body.select_status,
      // data_horario_inicio: data_ini_full ,
      // data_hora_fim: data_fim_full,
      // urlImagem: req.body.urlImagem
    },
    { where: { idEvento: req.params.idEvento } }
  )
    .then((evento) => {
      res.send(evento);
    })
    .catch((err) => {
      res.status(500).send(`Error ${err}`);
    });
};

exports.delete = (req, res) => {
  Evento.destroy({ where: { idEvento: req.params.idEvento } })
    .then(() => {
      res.send({ msg: 'Evento deletado com sucesso' }); // Retorna um Json para a Pagina da API
    })
    .catch((err) => {
      res.status(500).send(`Error -> ${err}`);
    });
};

exports.getAllEventosCPF = async (req, res) => {
  try {
    const { CPF } = req.body;
    const eventos = await Evento.findAll({
      where: { status: 1 },
      include: [
        { model: db.agenda, as: 'agendamento' },
      ],
    });
    if (!eventos)
      return res.status(404).json('Não existe nenhum evento disponivel');

    const novosEventos = []
    eventos.forEach(async (e) => {

      const lotes = await e.getLotes({
        attributes: ['idLote', 'valor', 'dataAbertura', 'dataFechamento'],
      });
      const lotesVencidos = [];
      const lotesDisponiveis = [];
      const dataAtual = new Date();

      lotes.forEach((lote) => {
        const dataLoteF = new Date(lote.dataFechamento);
        const dataLoteA = new Date(lote.dataAbertura);
        if (dataLoteF < dataAtual) {
          lotesVencidos.push(lote.dataValues);
        }
        else if(dataLoteA > dataAtual){
          lotesVencidos.push(lote.dataValues);
        } 
        else {
          lotesDisponiveis.push(lote.dataValues);
        }
      });
      const eObj = {
        ...e.dataValues,
        lotesDisponiveis,
        lotesVencidos,
      };

  
      // console.log(idEventosInscrito)


      novosEventos.push(eObj)
    })

    const idEventosInscrito = (
      await Inscricao.findAll({
        attributes: ['idEvento'],
        where: { CPF:atob(CPF) },
      })
    ).map((e) => (e.idEvento))
    finalEvents = []
    novosEventos.forEach((e) => {
      console.log(e)
      const finalObj = {
        ...e,
        estaInscrito:idEventosInscrito.includes(e.idEvento)
      };
      finalEvents.push(finalObj)
    })

    return res.status(200).json(finalEvents);
  } catch (error) {
    console.log(error)
    return res.status(500).json(error);
  }
};

exports.getAllAvailableEvents = async (req, res) => {
  try {
    const eventos = await Evento.findAll({
      where: { status: 1 },
      include: [
        { model: db.lote, as: 'lotes' },
        { model: db.agenda, as: 'agendamento' },
      ],
    });

    if (!eventos)
      return res.status(404).json('Não existe nenhum evento disponivel');

    return res.status(200).json(eventos);
  } catch (error) {
    return res.status(500).json(error);
  }
};

exports.EvReceita = (req, res) => {
  // receita de um evento
  db.receita
    .findAll({ where: { idEvento: req.params.idEvento } })
    .then((recEv) => {
      res.send(recEv);
    })
    .catch((err) => {
      res.status(500).send(`Error -> ${err}`);
    });
};

// receita de inscritos no evento
exports.RecInEv = (req, res) => {
  db.receitaInscricaoEvento
    .findAll({ where: { idEvento: req.params.idEvento } })
    .then((inscEv) => {
      res.send(inscEv);
    })
    .catch((err) => {
      res.status(500).send(`Error -> ${err}`);
    });
};

exports.DespEv = (req, res) => {
  // despesa de um evento
  db.despesa
    .findAll({ where: { idEvento: req.params.idEvento } })
    .then((DeEv) => {
      res.send(DeEv);
    })
    .catch((err) => {
      res.status(500).send(`Error -> ${err}`);
    });
};

//------------------------------------------------------------------------------------------
// foi trocado IDPessoa para CPF

exports.criaOrganizacao = (req, res) => {
  Evento.findOne({ where: { idEvento: req.params.idEvento } })
    .then((evento) => {
      db.pessoa
        .findOne({ where: { CPF: atob(req.params.CPF) } })
        .then((pessoa) => {
          db.organizacao
            .create({
              horasParticipacao: req.body.horasParticipacao,
              idEvento: evento.idEvento,
              CPF: pessoa.CPF,
            })
            .then((org) => {
              res.send(org);
            })
            .catch((err) => {
              res.status(500).send(`Error -> ${err}`);
            });
        })
        .catch((err) => {
          res.status(500).send(`Error -> ${err}`);
        });
    })
    .catch((err) => {
      res.status(500).send(`Error -> ${err}`);
    });
};

exports.selectOrganizacao = (req, res) => {
  // seleciona todos organizadores em todos eventos
  db.organizacao
    .findAll({
      include: [
        { model: db.pessoa, as: 'oPes' },
        { model: db.evento, as: 'oEv' },
      ],
    })
    .then((org) => {
      res.send(org);
    })
    .catch((err) => {
      res.status(500).send(`Error -> ${err}`);
    });
};

exports.selectUmOrganizador = (req, res) => {
  // seleciona um organizdor de um evento
  db.organizacao
    .findOne({
      where: { CPF: atob(req.params.CPF), idEvento: req.params.idEvento },
      include: [
        { model: db.pessoa, as: 'oPes' },
        { model: db.evento, as: 'oEv' },
      ],
    })
    .then((org) => {
      res.send(org);
    })
    .catch((err) => {
      res.status(500).send(`Error -> ${err}`);
    });
};

exports.selectOrganizacaoEvento = (req, res) => {
  // seleciona os organizadores de um evento
  db.organizacao
    .findAll({
      where: { idEvento: req.params.idEvento },
      include: [
        { model: db.pessoa, as: 'oPes' },
        { model: db.evento, as: 'oEv' },
      ],
    })
    .then((org) => {
      res.send(org);
    })
    .catch((err) => {
      res.status(500).send(`Error -> ${err}`);
    });
};

exports.selectEventoOrganizador = (req, res) => {
  // seleciona os eventos onde a pessoa é organizadora
  db.organizacao
    .findAll({
      where: { CPF: atob(req.params.CPF) },
      include: [
        { model: db.pessoa, as: 'oPes' },
        { model: db.evento, as: 'oEv' },
      ],
    })
    .then((org) => {
      res.send(org);
    })
    .catch((err) => {
      res.status(500).send(`Error -> ${err}`);
    });
};

exports.deleteOrganizacao = (req, res) => {
  db.organizacao
    .destroy({
      where: { CPF: atob(req.params.CPF), idEvento: req.params.idEvento },
    })
    .then(() => {
      res.send('deletou');
    })
    .catch((err) => {
      res.status(500).send(`Error -> ${err}`);
    });
};

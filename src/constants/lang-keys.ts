export const LangKeys = {
  Commands: {
    Dev: {
      Info: 'data.displayEmbeds.devInfo',
      NotDeveloper: 'data.validationEmbeds.devOnly',
      StartupInProcess: 'data.errorEmbeds.startupInProcess',
    },
    Help: {
      ContactSupport: 'data.displayEmbeds.helpContactSupport',
      Commands: 'data.displayEmbeds.helpCommands',
    },
    Info: {
      About: 'data.displayEmbeds.about',
      Translate: 'data.displayEmbeds.translate',
      TranslatorList: 'meta.translators',
    },
    Test: {
      Test: 'data.displayEmbeds.test',
    },
    New: {
      CreateSuccessChannel: 'newCommand.season.create_success_channel',
      ErrorMinMaxPlayers: 'newCommand.season.error_min_max_players',
      ErrorCreatorNotFound: 'newCommand.season.error_creator_not_found',
      ErrorPlayerCreateFailed: 'newCommand.season.error_player_create_failed',
      ErrorDb: 'newCommand.season.error_db',
      ErrorUnknownService: 'newCommand.season.error_unknown_service',
      ErrorGenericService: 'newCommand.season.error_generic_service',
      ErrorUnknown: 'newCommand.season.error_unknown',
      ErrorUnknownSubcommand: 'newCommand.error_unknown_subcommand',
      CriticalError: 'common.error.critical_command',
    },
    JoinSeason: {
      playerNotFound: 'joinSeason.playerNotFound',
      seasonNotFound: 'joinSeason.seasonNotFound',
      notOpen: 'joinSeason.notOpen',
      full: 'joinSeason.full',
      alreadyJoined: 'joinSeason.alreadyJoined',
      success: 'joinSeason.success',
      genericError: 'joinSeason.genericError',
    },
    Status: {
      seasonNotFound: 'status.seasonNotFound',
      seasonStatus: 'status.seasonStatus',
      genericError: 'status.genericError',
    },
    Admin: {
      NotAdmin: 'data.validationEmbeds.adminOnly',
      TerminateSeasonSuccess: 'admin.terminate_season_success',
      TerminateSeasonErrorNotFound: 'admin.terminate_season_error_not_found',
      TerminateSeasonErrorAlreadyTerminated: 'admin.terminate_season_error_already_terminated',
      TerminateSeasonErrorDatabase: 'admin.terminate_season_error_database',
      TerminateSeasonErrorUnknown: 'admin.terminate_season_error_unknown',
      ListSeasonsSuccess: 'admin.list_seasons_success',
      ListSeasonsError: 'admin.list_seasons_error',
      ListPlayersSuccess: 'admin.list_players_success',
      ListPlayersError: 'admin.list_players_error',
    },
    Config: {
      ViewSuccess: 'config.view_success',
      UpdateSuccess: 'config.update_success',
      ValidationError: 'config.validation_error',
      DatabaseError: 'config.database_error',
      UnknownError: 'config.unknown_error',
      NotAdmin: 'data.validationEmbeds.adminOnly',
    },
    // Add other commands here in the future
  },
} as const; 
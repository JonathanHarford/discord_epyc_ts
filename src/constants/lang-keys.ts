export const LangKeys = {
  Commands: {
    JoinCommand: {
      // Keys used in SeasonService.ts
      PlayerNotFound: 'season_join_error_player_not_found',
      SeasonNotFound: 'season_join_error_season_not_found',
      NotOpen: 'season_join_error_not_open',
      Full: 'season_join_error_full',
      AlreadyJoined: 'season_join_error_already_joined',
      Success: 'season_join_success',
      GenericError: 'season_join_error_generic',
      // Keys used in joinSeason.ts (discord reply keys)
      RefNotFound: 'joinCommand.join_season_error_not_found',
      RefNotOpen: 'joinCommand.join_season_error_not_open',
      RefUnknown: 'joinCommand.join_season_error_unknown',
    },
    // Add other commands here in the future
  },
} as const; 
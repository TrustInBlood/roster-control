const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const { createServiceLogger } = require('../utils/logger');

const logger = createServiceLogger('PassportConfig');

/**
 * Configure passport with Discord OAuth strategy
 * @param {object} app - Express app instance
 * @param {object} sequelize - Sequelize instance
 * @param {object} discordClient - Discord.js client instance
 */
function configurePassport(app, sequelize, discordClient) {
  // Validate required environment variables
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_OAUTH_CLIENT_SECRET;
  const callbackUrl = process.env.DISCORD_OAUTH_CALLBACK_URL || 'http://localhost:3001/api/v1/auth/callback';
  const sessionSecret = process.env.SESSION_SECRET;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!clientId || !clientSecret) {
    logger.warn('Discord OAuth not configured - DISCORD_CLIENT_ID or DISCORD_OAUTH_CLIENT_SECRET missing');
    return false;
  }

  if (!sessionSecret) {
    logger.warn('SESSION_SECRET not set - using insecure default (not recommended for production)');
  }

  // Configure session store
  const sessionStore = new SequelizeStore({
    db: sequelize,
    tableName: 'dashboard_sessions',
    checkExpirationInterval: 15 * 60 * 1000, // Clean up every 15 minutes
    expiration: 24 * 60 * 60 * 1000 // Sessions expire after 24 hours
  });

  // Session middleware
  app.use(session({
    secret: sessionSecret || 'insecure-dev-secret-change-me',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true if using HTTPS
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax'
    },
    name: 'roster.sid'
  }));

  // Initialize passport
  app.use(passport.initialize());
  app.use(passport.session());

  // Discord OAuth strategy
  passport.use(new DiscordStrategy({
    clientID: clientId,
    clientSecret: clientSecret,
    callbackURL: callbackUrl,
    scope: ['identify', 'guilds', 'guilds.members.read']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      logger.info('Discord OAuth callback received', {
        userId: profile.id,
        username: profile.username
      });

      // Fetch guild member info to get roles
      let guildMember = null;
      let roles = [];

      if (guildId && discordClient) {
        try {
          const guild = await discordClient.guilds.fetch(guildId);
          guildMember = await guild.members.fetch(profile.id);
          // Filter out @everyone role (has same ID as guild)
          roles = guildMember.roles.cache
            .filter(role => role.id !== guild.id)
            .map(role => role.id);

          logger.info('Fetched guild member info', {
            userId: profile.id,
            roleCount: roles.length
          });
        } catch (guildError) {
          logger.warn('Could not fetch guild member info', {
            userId: profile.id,
            error: guildError.message
          });

          // User might not be in the guild
          if (guildError.code === 10007) {
            return done(null, false, { message: 'You must be a member of the Discord server to access the dashboard' });
          }
        }
      }

      // Build user object
      const user = {
        id: profile.id,
        username: profile.username,
        discriminator: profile.discriminator,
        avatar: profile.avatar,
        accessToken,
        refreshToken,
        roles,
        guildMember: guildMember ? {
          displayName: guildMember.displayName,
          nickname: guildMember.nickname,
          joinedAt: guildMember.joinedAt
        } : null
      };

      return done(null, user);
    } catch (error) {
      logger.error('Error in Discord OAuth callback', { error: error.message });
      return done(error);
    }
  }));

  // Serialize user to session
  passport.serializeUser((user, done) => {
    done(null, {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      roles: user.roles,
      guildMember: user.guildMember
    });
  });

  // Deserialize user from session
  passport.deserializeUser((sessionUser, done) => {
    // Return the user object stored in session
    // Roles are cached at login time
    done(null, sessionUser);
  });

  // Sync session table (creates if not exists)
  sessionStore.sync();

  logger.info('Passport configured with Discord OAuth strategy');
  return true;
}

module.exports = { configurePassport };

import logger from './logger.js';
import { auditLog } from './audit.js';

/**
 * WebRTC signaling service for video consultations
 */
export default class SignalingService {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // Map of active rooms

    this.setupSocketHandlers();
    logger.info('Signaling service initialized');
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      logger.info(`New socket connection: ${socket.id}`);

      socket.on('authenticate', async (data, callback) => {
        try {
          const { userId, roomId, token, role } = data;

          if (!this.validateRoomAccess(userId, roomId, token)) {
            callback({ success: false, error: 'Authentication failed' });
            return;
          }

          socket.userId = userId;
          socket.userRole = role;
          socket.roomId = roomId;
          socket.join(roomId);

          if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, {
              id: roomId,
              participants: new Map(),
              started: false,
              startedAt: null,
              appointmentId: data.appointmentId || null
            });
          }

          const room = this.rooms.get(roomId);
          room.participants.set(socket.id, {
            socketId: socket.id,
            userId,
            role,
            joinedAt: new Date()
          });

          if (!room.started) {
            room.started = true;
            room.startedAt = new Date();
          }

          this.logSessionEvent('join', roomId, userId, role);

          socket.to(roomId).emit('user-connected', {
            socketId: socket.id,
            userId,
            role
          });

          const participants = Array.from(room.participants.values())
            .filter((p) => p.socketId !== socket.id)
            .map((p) => ({
              socketId: p.socketId,
              userId: p.userId,
              role: p.userRole
            }));

          callback({
            success: true,
            participants,
            sessionStarted: room.startedAt
          });

          logger.info(
            `Room ${roomId} now has ${room.participants.size} participants`
          );
        } catch (error) {
          logger.error(`Authentication error: ${error.message}`);
          callback({
            success: false,
            error: 'Server error during authentication'
          });
        }
      });

      socket.on('signal', (data) => {
        if (data.to) {
          this.io.to(data.to).emit('signal', {
            from: socket.id,
            signal: data.signal
          });
        }
      });

      socket.on('chat-message', (data) => {
        if (!socket.roomId) return;

        this.io.to(socket.roomId).emit('chat-message', {
          from: socket.userId,
          role: socket.userRole,
          message: data.message,
          timestamp: new Date().toISOString()
        });

        this.logChatMessage(socket.roomId, socket.userId, data.message);
      });

      socket.on('recording-status', (data) => {
        if (!socket.roomId) return;

        this.io.to(socket.roomId).emit('recording-status', {
          isRecording: data.isRecording,
          initiatedBy: socket.userId,
          role: socket.userRole
        });

        this.logSessionEvent(
          data.isRecording ? 'recording-start' : 'recording-stop',
          socket.roomId,
          socket.userId,
          socket.userRole
        );
      });

      socket.on('disconnect', () => this.handleDisconnect(socket));
      socket.on('leave-room', () => this.handleDisconnect(socket));
    });
  }

  handleDisconnect(socket) {
    const { roomId, userId, userRole } = socket;
    if (!roomId) return;

    logger.info(`User disconnected from room ${roomId}: ${socket.id}`);

    const room = this.rooms.get(roomId);
    if (room) {
      room.participants.delete(socket.id);

      socket
        .to(roomId)
        .emit('user-disconnected', { socketId: socket.id, userId });

      this.logSessionEvent('leave', roomId, userId, userRole);

      if (room.participants.size === 0) {
        const sessionDuration = room.startedAt
          ? Math.round((new Date() - room.startedAt) / 1000)
          : 0;

        this.rooms.delete(roomId);
        logger.info(
          `Room ${roomId} closed. Duration: ${sessionDuration} seconds`
        );

        this.updateAppointmentSession(room.appointmentId, {
          endedAt: new Date(),
          duration: sessionDuration
        });
      } else {
        logger.info(
          `Room ${roomId} now has ${room.participants.size} participants`
        );
      }
    }

    socket.leave(roomId);
  }

  validateRoomAccess(userId, roomId, token) {
    return userId && roomId && token;
  }

  logSessionEvent(eventType, roomId, userId, role) {
    logger.info(`Session event: ${eventType}`, { roomId, userId, role });

    auditLog({
      user: userId,
      action: 'video_session',
      actionType: 'update',
      resource: 'video',
      resourceId: roomId,
      description: `Video session ${eventType}`,
      status: 'success',
      metadata: { eventType, role, roomId }
    }).catch((err) =>
      logger.error(`Failed to create session audit log: ${err.message}`)
    );
  }

  logChatMessage(roomId, userId, message) {
    logger.debug(
      `Chat in room ${roomId} from ${userId}: ${message.substring(0, 20)}...`
    );
  }

  async updateAppointmentSession(appointmentId, sessionData) {
    if (!appointmentId) return;

    try {
      logger.info(
        `Video session ended for appointment ${appointmentId}`,
        sessionData
      );
    } catch (err) {
      logger.error(
        `Failed to update appointment with session data: ${err.message}`
      );
    }
  }
}

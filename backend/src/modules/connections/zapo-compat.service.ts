import { WhatsAppClient } from '../../lib/whatsapp';
import { ZapoService } from '../../lib/zapo';
import { prisma } from '../../server';

export class ZapoCompatService {
  private static getClient(instanceId: string): WhatsAppClient {
      return new WhatsAppClient(undefined, undefined, undefined, instanceId);
  }

  // ─── Chat Operations ─────────────────────────────────────────────────

  static async archiveChat(instanceId: string, phone: string, _archive = true) {
      const wa = this.getClient(instanceId);
      await wa.archiveChat(phone);
      return { success: true };
  }

  static async muteChat(instanceId: string, phone: string, _duration?: number) {
      const wa = this.getClient(instanceId);
      await wa.muteChat(phone);
      return { success: true };
  }

  static async pinChat(instanceId: string, phone: string) {
      const wa = this.getClient(instanceId);
      await wa.pinChat(phone);
      return { success: true };
  }

  static async unpinChat(instanceId: string, phone: string) {
      const wa = this.getClient(instanceId);
      await wa.unpinChat(phone);
      return { success: true };
  }

  // ─── Group Operations ────────────────────────────────────────────────

  static async createGroup(instanceId: string, name: string, participants: string[]) {
      const wa = this.getClient(instanceId);
      const res = await wa.createGroup(name, participants);
      return { success: true, data: res };
  }

  static async getGroupInfo(instanceId: string, groupId: string) {
      const wa = this.getClient(instanceId);
      const info = await wa.getGroupInfo(groupId);
      return { success: true, data: info };
  }

  static async getGroupInviteLink(instanceId: string, groupId: string) {
      const wa = this.getClient(instanceId);
      const res = await wa.getGroupInviteLink(groupId);
      return { success: true, data: res };
  }

  static async joinGroupByLink(instanceId: string, inviteCode: string) {
      const wa = this.getClient(instanceId);
      const res = await wa.joinGroupByLink(inviteCode);
      return { success: true, data: res };
  }

  static async listGroups(instanceId: string) {
      const wa = this.getClient(instanceId);
      const list = await wa.listGroups();
      return { success: true, data: list };
  }

  static async getMyGroups(instanceId: string) {
      const wa = this.getClient(instanceId);
      const list = await wa.getMyGroups();
      return { success: true, data: list };
  }

  static async setGroupName(instanceId: string, groupId: string, name: string) {
      const wa = this.getClient(instanceId);
      await wa.setGroupName(groupId, name);
      return { success: true };
  }

  static async updateParticipant(instanceId: string, groupId: string, phone: string, action: 'add' | 'remove' | 'promote' | 'demote') {
      const wa = this.getClient(instanceId);
      const res = await wa.updateParticipant(groupId, phone, action);
      return { success: true, data: res };
  }

  static async setGroupPhoto(instanceId: string, groupId: string, photoUrl: string) {
      const wa = this.getClient(instanceId);
      await wa.setGroupPhoto(groupId, photoUrl);
      return { success: true };
  }

  // ─── User Operations ─────────────────────────────────────────────────

  static async getUserAvatar(instanceId: string, phone: string) {
      const wa = this.getClient(instanceId);
      const res = await wa.getUserAvatar(phone);
      return { success: true, data: res };
  }

  static async blockContact(instanceId: string, phone: string) {
      const wa = this.getClient(instanceId);
      await wa.blockContact(phone);
      return { success: true };
  }

  static async getBlockList(instanceId: string) {
      const wa = this.getClient(instanceId);
      const list = await wa.getBlockList();
      return { success: true, data: list };
  }

  static async checkUser(instanceId: string, phone: string) {
      const wa = this.getClient(instanceId);
      const res = await wa.checkUser(phone);
      return { success: true, data: res };
  }

  static async getContacts(instanceId: string) {
      const wa = this.getClient(instanceId);
      const list = await wa.getContacts();
      return { success: true, data: list };
  }

  static async getUser(instanceId: string, phone: string) {
      const wa = this.getClient(instanceId);
      const res = await wa.getUser(phone);
      return { success: true, data: res };
  }

  static async getPrivacySettings(instanceId: string) {
      const wa = this.getClient(instanceId);
      const settings = await wa.getPrivacySettings();
      return { success: true, data: settings };
  }

  static async setProfilePicture(instanceId: string, photoUrl: string) {
      const wa = this.getClient(instanceId);
      await wa.setProfilePicture(photoUrl);
      return { success: true };
  }

  static async unblockContact(instanceId: string, phone: string) {
      const wa = this.getClient(instanceId);
      await wa.unblockContact(phone);
      return { success: true };
  }

  // ─── Label Operations ────────────────────────────────────────────────

  static async addLabelToChat(instanceId: string, phone: string, labelId: string) {
      const wa = this.getClient(instanceId);
      await wa.addLabelToChat(phone, labelId);
      return { success: true };
  }

  static async removeLabelFromChat(instanceId: string, phone: string, labelId: string) {
      const wa = this.getClient(instanceId);
      await wa.removeLabelFromChat(phone, labelId);
      return { success: true };
  }

  static async editLabel(instanceId: string, labelId: string, name: string, color: string) {
      const wa = this.getClient(instanceId);
      await wa.editLabel(labelId, name, color);
      return { success: true };
  }

  static async addLabelToMessage(instanceId: string, messageId: string, labelId: string) {
      const wa = this.getClient(instanceId);
      await wa.addLabelToMessage(messageId, '', labelId);
      return { success: true };
  }

  static async removeLabelFromMessage(instanceId: string, messageId: string, labelId: string) {
      const wa = this.getClient(instanceId);
      await wa.removeLabelFromMessage(messageId, labelId);
      return { success: true };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Trend, TrendDocument } from './schemas/trend.schema';
import { Cron, CronExpression } from '@nestjs/schedule';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class TrendsService {
  private readonly logger = new Logger(TrendsService.name);

  constructor(
    @InjectModel(Trend.name) private trendModel: Model<TrendDocument>,
    private config: ConfigService,
  ) {}

  async discoverTrends(userId: string, agentId: string, niche: string) {
    this.logger.log(`Discovering trends for niche: ${niche}`);

    // Call our Python FastAPI service
    const pythonUrl = this.config.get('PYTHON_SERVICE_URL') || 'http://localhost:8001';

    try {
      const response = await fetch(`${pythonUrl}/trends/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche, agent_id: agentId }),
      });

      const data = await response.json() as any;

      const trend = await this.trendModel.create({
        agentId: new Types.ObjectId(agentId),
        userId: new Types.ObjectId(userId),
        niche,
        discoveredTopics: data.topics,
        rawYoutubeData: data.raw_results,
        selectedTopic: data.selected_topic,
        topicReason: data.reason,
        status: 'pending',
        trendDate: new Date(),
      });

      return trend;
    } catch (error) {
      this.logger.error('Trend discovery failed:', error.message);
      throw error;
    }
  }

  async getTrends(userId: string, agentId: string) {
    return this.trendModel
      .find({ userId: new Types.ObjectId(userId), agentId: new Types.ObjectId(agentId) })
      .sort({ trendDate: -1 })
      .limit(20);
  }

  async markTrendUsed(trendId: string) {
    return this.trendModel.findByIdAndUpdate(
      trendId,
      { status: 'used' },
      { new: true },
    );
  }

  async getLatestPendingTrend(agentId: string) {
    return this.trendModel.findOne({
      agentId: new Types.ObjectId(agentId),
      status: 'pending',
    }).sort({ trendDate: -1 });
  }
}
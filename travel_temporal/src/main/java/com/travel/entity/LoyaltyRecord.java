package com.travel.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.*;

@Entity
@Table(name = "loyalty_records")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LoyaltyRecord {
    @Id
    private String loyaltyId;
    private String userId;
    private String bookingId;
    private int points;
    private String status; // AWARDED, REVERTED
}

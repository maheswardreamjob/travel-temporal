package com.travel.repository;

import com.travel.entity.LoyaltyRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface LoyaltyRecordRepository extends JpaRepository<LoyaltyRecord, String> {
    List<LoyaltyRecord> findByBookingId(String bookingId);
}
